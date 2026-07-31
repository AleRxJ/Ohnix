import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    ensureUserSubscription,
    getEffectivePlan,
    getMonthBounds,
    getPlanLimits,
} from "../middleware/pricing.middleware.js";
import {
    notifyAdminsUpgradeRequestCreated,
    notifyUserUpgradeRequestResolved,
    notifyUserPlanActivated,
} from "../utils/upgradeRequestNotifications.js";
import {
    createUpgradeCheckoutSession as createUpgradeCheckoutSessionProvider,
    getSupportedPaymentMethodsByCountry,
    isAutonomousCheckoutConfigured,
    parsePaymentWebhookEvent,
    verifyStripeSession,
} from "../services/payment.service.js";
import {
    buildEpaycoWidgetParams,
    isEpaycoConfigured,
    validateEpaycoSignature,
    queryEpaycoTransaction,
    EPAYCO_STATE,
    isEpaycoTransactionApproved,
} from "../services/epayco.service.js";

const normalizePaymentLink = (value) => {
    const trimmed = `${value || ""}`.trim();
    return trimmed || null;
};

const isValidHttpUrl = (value) => {
    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
};

const ALLOWED_STATUS_TRANSITIONS = {
    open: ["reviewing", "approved", "rejected", "closed"],
    reviewing: ["approved", "rejected", "closed"],
    approved: ["closed"],
    rejected: [],
    closed: [],
};

const SPECIAL_ENTERPRISE_REVIEW_REGEX =
    /(factura|invoice|descuento|discount|negoci|custom|personaliz|contrato|contract|sla|onboarding|implementation|implementacion|po\b|purchase\s*order)/i;

const shouldRouteToManualReview = ({
    targetPlan,
    notes,
    requiresManualReview,
}) => {
    if (requiresManualReview === true) {
        return true;
    }

    if (targetPlan !== "enterprise") {
        return false;
    }

    return SPECIAL_ENTERPRISE_REVIEW_REGEX.test(`${notes || ""}`);
};

const UPGRADE_REQUEST_SELECT = {
    id: true,
    userId: true,
    currentPlan: true,
    targetPlan: true,
    status: true,
    notes: true,
    adminResponse: true,
    paymentLink: true,
    paymentProvider: true,
    paymentSessionId: true,
    paymentStatus: true,
    paidAt: true,
    createdAt: true,
    updatedAt: true,
};

const getUsageSnapshot = async (userId, subscription) => {
    const effectivePlan = getEffectivePlan(subscription);
    const limits = getPlanLimits(effectivePlan);
    const { start, end } = getMonthBounds();

    const [
        products,
        customers,
        suppliers,
        categories,
        units,
        orders,
        purchases,
        monthlyOrders,
        monthlyPurchases,
    ] = await Promise.all([
        prisma.product.count({ where: { createdById: userId } }),
        prisma.customer.count({ where: { createdById: userId } }),
        prisma.supplier.count({ where: { createdById: userId } }),
        prisma.category.count({ where: { createdById: userId } }),
        prisma.unit.count({ where: { createdById: userId } }),
        prisma.order.count({ where: { createdById: userId } }),
        prisma.purchase.count({ where: { createdById: userId } }),
        prisma.order.count({
            where: {
                createdById: userId,
                createdAt: { gte: start, lte: end },
            },
        }),
        prisma.purchase.count({
            where: {
                createdById: userId,
                createdAt: { gte: start, lte: end },
            },
        }),
    ]);

    const usage = {
        products,
        customers,
        suppliers,
        categories,
        units,
        orders,
        purchases,
        monthlyOrders,
        monthlyPurchases,
    };

    const withProgress = Object.entries(usage).reduce((acc, [key, used]) => {
        const limitKey =
            key === "monthlyOrders"
                ? "maxMonthlyOrders"
                : key === "monthlyPurchases"
                  ? "maxMonthlyPurchases"
                  : `max${key[0].toUpperCase()}${key.slice(1)}`;

        const limit = limits[limitKey] ?? null;
        acc[key] = {
            used,
            limit,
            remaining: limit === null ? null : Math.max(0, limit - used),
            usagePercent:
                limit === null || limit === 0
                    ? null
                    : Number(((used / limit) * 100).toFixed(2)),
        };

        return acc;
    }, {});

    return {
        plan: subscription?.plan,
        effectivePlan,
        trialEndsAt: subscription?.trialEndsAt ?? null,
        limits,
        usage: withProgress,
        monthlyWindow: {
            start,
            end,
        },
    };
};

const closeApprovedRequestAndActivatePlan = async ({
    requestId,
    actedBy,
    paymentSessionId,
    paymentStatus = "paid",
    paymentProvider = "stripe",
    paymentLink,
    adminResponse,
}) => {
    // Paid plans renew every 30 days — set endsAt on activation
    const SUBSCRIPTION_PERIOD_DAYS = 30;
    const endsAt = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.planUpgradeRequest.findUnique({
            where: { id: requestId },
            select: UPGRADE_REQUEST_SELECT,
        });

        if (!existing) {
            return null;
        }

        if (existing.status !== "approved") {
            return { request: existing, activated: false };
        }

        await tx.subscription.upsert({
            where: { userId: existing.userId },
            update: {
                plan: existing.targetPlan,
                status: "active",
                endsAt,   // 30 days from now
                trialEndsAt: null, // clear trial once a paid plan is active
            },
            create: {
                userId: existing.userId,
                plan: existing.targetPlan,
                status: "active",
                endsAt,
            },
        });

        const closedRequest = await tx.planUpgradeRequest.update({
            where: { id: existing.id },
            data: {
                status: "closed",
                paymentProvider,
                paymentSessionId: paymentSessionId || existing.paymentSessionId,
                paymentStatus,
                paymentLink: paymentLink || existing.paymentLink,
                paidAt: paymentStatus === "paid" ? new Date() : existing.paidAt,
                adminResponse:
                    adminResponse?.trim() ||
                    existing.adminResponse ||
                    "Payment confirmed automatically. Plan activated.",
            },
            select: UPGRADE_REQUEST_SELECT,
        });

        return { request: closedRequest, activated: true };
    });

    if (!result?.request) {
        return null;
    }

    if (result.activated) {
        const targetUser = await prisma.user.findUnique({
            where: { id: result.request.userId },
            select: {
                email: true,
                username: true,
                preferredLanguage: true,
            },
        });

        await notifyUserUpgradeRequestResolved({
            request: result.request,
            user: targetUser,
            actedBy,
            locale: targetUser?.preferredLanguage,
        });

        // Also send dedicated plan activated email
        notifyUserPlanActivated({
            user: targetUser,
            targetPlan: result.request.targetPlan,
            locale: targetUser?.preferredLanguage,
        }).catch(() => {});
    }

    return result;
};

export const getMySubscription = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);
    const effectivePlan = getEffectivePlan(subscription);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                plan: subscription.plan,
                effectivePlan,
                status: subscription.status,
                trialEndsAt: subscription.trialEndsAt ?? null,
                limits: getPlanLimits(effectivePlan),
            },
            "Subscription fetched successfully"
        )
    );
});

export const getMyUsage = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);

    const usage = await getUsageSnapshot(req.user.prismaId, subscription);

    return res
        .status(200)
        .json(new ApiResponse(200, usage, "Usage fetched successfully"));
});

const setMyStatus = (status, message) =>
    asyncHandler(async (req, res) => {
        const subscription = await ensureUserSubscription(req.user.prismaId);

        const updated = await prisma.subscription.update({
            where: { userId: req.user.prismaId },
            data: {
                status,
                endsAt: status === "active" ? null : subscription.endsAt || new Date(),
            },
            select: {
                plan: true,
                status: true,
                startedAt: true,
                endsAt: true,
            },
        });

        return res.status(200).json(new ApiResponse(200, updated, message));
    });

export const pauseMySubscription = setMyStatus(
    "paused",
    "Subscription paused successfully"
);

export const cancelMySubscription = setMyStatus(
    "canceled",
    "Subscription canceled successfully"
);

export const reactivateMySubscription = setMyStatus(
    "active",
    "Subscription reactivated successfully"
);

export const updateUserPlan = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { plan } = req.body;

    if (!plan || !["starter", "growth", "enterprise"].includes(plan)) {
        return next(new ApiError(400, "A valid plan is required"));
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });

    if (!targetUser) {
        return next(new ApiError(404, "Target user not found"));
    }

    await ensureUserSubscription(targetUser.id);

    const updated = await prisma.subscription.update({
        where: { userId: targetUser.id },
        data: {
            plan,
            status: "active",
            endsAt: null,
        },
        select: {
            userId: true,
            plan: true,
            status: true,
            startedAt: true,
            endsAt: true,
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "User plan updated successfully"));
});

export const getUserUsageAdmin = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });

    if (!targetUser) {
        return next(new ApiError(404, "Target user not found"));
    }

    const subscription = await ensureUserSubscription(targetUser.id);
    const usage = await getUsageSnapshot(targetUser.id, subscription);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                userId: targetUser.id,
                status: subscription.status,
                ...usage,
            },
            "User usage fetched successfully"
        )
    );
});

export const createUpgradeRequest = asyncHandler(async (req, res, next) => {
    const { targetPlan, notes, requiresManualReview } = req.body;

    if (!targetPlan || !["growth", "enterprise"].includes(targetPlan)) {
        return next(
            new ApiError(400, "A valid target plan is required (growth or enterprise)")
        );
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);

    if (subscription.plan === targetPlan) {
        return next(new ApiError(400, "You are already on this plan"));
    }

    const existingOpenRequest = await prisma.planUpgradeRequest.findFirst({
        where: {
            userId: req.user.prismaId,
            status: {
                in: ["open", "reviewing", "approved"],
            },
        },
        select: { id: true },
    });

    if (existingOpenRequest) {
        return next(
            new ApiError(
                409,
                "You already have an upgrade request in progress"
            )
        );
    }

    const trimmedNotes = notes?.trim() || null;
    const requiresReview = shouldRouteToManualReview({
        targetPlan,
        notes: trimmedNotes,
        requiresManualReview,
    });

    const request = await prisma.planUpgradeRequest.create({
        data: {
            userId: req.user.prismaId,
            currentPlan: subscription.plan,
            targetPlan,
            notes: trimmedNotes,
            status: requiresReview ? "open" : "approved",
            adminResponse: requiresReview
                ? null
                : "Auto-approved for standard checkout. Complete payment to activate your plan.",
            paymentStatus: requiresReview ? null : "awaiting_checkout",
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    const requester = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: {
            email: true,
            username: true,
            preferredLanguage: true,
        },
    });

    if (requiresReview) {
        await notifyAdminsUpgradeRequestCreated({
            request,
            user: requester,
            source: "billing",
            locale: requester?.preferredLanguage || req.headers["accept-language"],
        });
    }

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                request,
                requiresReview
                    ? "Upgrade request created and routed to admin review"
                    : "Upgrade request auto-approved. Proceed to checkout."
            )
        );
});

export const getMyUpgradeRequests = asyncHandler(async (req, res) => {
    const requests = await prisma.planUpgradeRequest.findMany({
        where: {
            userId: req.user.prismaId,
        },
        select: UPGRADE_REQUEST_SELECT,
        orderBy: {
            createdAt: "desc",
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, requests, "Upgrade requests fetched successfully"));
});

export const getCheckoutPaymentMethods = asyncHandler(async (req, res) => {
    const methodsByCountry = getSupportedPaymentMethodsByCountry();

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                methodsByCountry,
            },
            "Checkout payment methods fetched successfully"
        )
    );
});

export const getUpgradeRequestsAdmin = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const validStatuses = ["open", "reviewing", "approved", "rejected", "closed"];
    const normalizedStatus = `${status || ""}`.trim();

    const requests = await prisma.planUpgradeRequest.findMany({
        where: {
            ...(validStatuses.includes(normalizedStatus)
                ? { status: normalizedStatus }
                : { status: { in: ["open", "reviewing"] } }),
        },
        select: {
            ...UPGRADE_REQUEST_SELECT,
            user: {
                select: {
                    id: true,
                    email: true,
                    username: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, requests, "Admin upgrade requests fetched successfully"));
});

export const createMyUpgradeCheckoutSession = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { country, paymentMethod } = req.body || {};

    if (!isAutonomousCheckoutConfigured()) {
        return next(
            new ApiError(
                503,
                "Autonomous checkout is not configured yet. Please contact support."
            )
        );
    }

    const request = await prisma.planUpgradeRequest.findFirst({
        where: {
            id,
            userId: req.user.prismaId,
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (request.status !== "approved") {
        return next(
            new ApiError(
                409,
                "Checkout is available only for approved upgrade requests"
            )
        );
    }

    const currentSubscription = await ensureUserSubscription(req.user.prismaId);
    if (
        currentSubscription.plan === request.targetPlan &&
        currentSubscription.status === "active"
    ) {
        return next(new ApiError(409, "Your target plan is already active"));
    }

    const requester = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: {
            id: true,
            email: true,
            username: true,
        },
    });

    if (!requester?.email) {
        return next(new ApiError(400, "A valid account email is required for checkout"));
    }

    let checkout;
    try {
        checkout = await createUpgradeCheckoutSessionProvider({
            request,
            user: requester,
            country,
            paymentMethod,
        });
    } catch (error) {
        console.error("Failed creating checkout session", error);
        return next(
            new ApiError(
                502,
                error?.message || "Failed to create checkout session"
            )
        );
    }

    await prisma.planUpgradeRequest.update({
        where: { id: request.id },
        data: {
            paymentProvider: `${checkout.provider}:${checkout.paymentMethod}:${checkout.country}`,
            paymentSessionId: checkout.sessionId,
            paymentStatus: "pending",
            paymentLink: checkout.checkoutUrl,
        },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                requestId: request.id,
                checkoutUrl: checkout.checkoutUrl,
                sessionId: checkout.sessionId,
                provider: checkout.provider,
            },
            "Checkout session created successfully"
        )
    );
});

export const getMyUpgradeCheckoutStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const request = await prisma.planUpgradeRequest.findFirst({
        where: {
            id,
            userId: req.user.prismaId,
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                request,
                subscription: {
                    plan: subscription.plan,
                    status: subscription.status,
                    limits: getPlanLimits(subscription.plan),
                },
                targetPlanActive:
                    request.targetPlan === subscription.plan &&
                    subscription.status === "active",
            },
            "Checkout status fetched successfully"
        )
    );
});

// Fallback: verify Stripe session directly and activate plan if payment confirmed
// Called by the frontend when the webhook hasn't fired yet
export const verifyAndActivateBySession = asyncHandler(async (req, res, next) => {
    const { id } = req.params; // upgradeRequestId
    const { sessionId } = req.body;

    if (!sessionId) {
        return next(new ApiError(400, "sessionId is required"));
    }

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (request.status === "closed") {
        const subscription = await ensureUserSubscription(req.user.prismaId);
        return res.status(200).json(new ApiResponse(200, {
            alreadyActivated: true,
            targetPlanActive: request.targetPlan === subscription.plan,
        }, "Plan already activated"));
    }

    if (request.status !== "approved") {
        return next(new ApiError(400, "Request is not in approved status"));
    }

    let paid = false;
    try {
        paid = await verifyStripeSession(sessionId);
    } catch (err) {
        console.error("[verify-activate] Stripe session check failed:", err?.message);
        return next(new ApiError(502, "Could not verify payment with Stripe"));
    }

    if (!paid) {
        return res.status(200).json(new ApiResponse(200, { paid: false }, "Payment not yet confirmed"));
    }

    await closeApprovedRequestAndActivatePlan({
        requestId: id,
        actedBy: "session-verify-fallback",
        paymentSessionId: sessionId,
        paymentProvider: "stripe",
        paymentStatus: "paid",
    });

    const subscription = await ensureUserSubscription(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, {
        activated: true,
        targetPlanActive: request.targetPlan === subscription.plan,
    }, "Plan activated successfully"));
});

export const handlePaymentWebhook = async (req, res) => {
    try {
        const signature = req.headers["stripe-signature"];
        const event = parsePaymentWebhookEvent({
            rawBody: req.body,
            headers: req.headers,
            signature,
        });

        const provider = event?.provider || "stripe";

        if (
            event?.type === "checkout.session.completed" ||
            event?.type === "payment.succeeded"
        ) {
            const session = event.data?.object;
            const upgradeRequestId =
                session?.metadata?.upgradeRequestId ||
                session?.upgradeRequestId ||
                session?.requestId;

            if (upgradeRequestId) {
                await closeApprovedRequestAndActivatePlan({
                    requestId: upgradeRequestId,
                    actedBy: "payment-webhook",
                    paymentSessionId:
                        session?.id || session?.sessionId || session?.reference,
                    paymentProvider: provider,
                    paymentStatus: "paid",
                    paymentLink:
                        session?.url || session?.checkoutUrl || session?.paymentUrl || null,
                });
            }
        }

        if (
            event?.type === "checkout.session.expired" ||
            event?.type === "payment.failed"
        ) {
            const session = event.data?.object;
            const upgradeRequestId =
                session?.metadata?.upgradeRequestId ||
                session?.upgradeRequestId ||
                session?.requestId;

            if (upgradeRequestId) {
                await prisma.planUpgradeRequest.updateMany({
                    where: {
                        id: upgradeRequestId,
                        status: "approved",
                    },
                    data: {
                        paymentStatus:
                            event?.type === "payment.failed" ? "failed" : "expired",
                    },
                });
            }
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("Payment webhook processing failed", error);
        return res.status(400).json({
            received: false,
            message: "Invalid payment webhook payload",
        });
    }
};

export const updateUpgradeRequestAdmin = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { status, adminResponse, paymentLink } = req.body;

    if (!status || !["reviewing", "approved", "rejected", "closed"].includes(status)) {
        return next(new ApiError(400, "A valid status is required"));
    }

    const existing = await prisma.planUpgradeRequest.findUnique({
        where: { id },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!existing) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    const statusChanged = existing.status !== status;
    const normalizedPaymentLink = normalizePaymentLink(paymentLink);

    if (statusChanged) {
        const allowedTargets = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
        if (!allowedTargets.includes(status)) {
            return next(
                new ApiError(
                    409,
                    `Invalid status transition: ${existing.status} -> ${status}`
                )
            );
        }
    }

    if (normalizedPaymentLink && !isValidHttpUrl(normalizedPaymentLink)) {
        return next(new ApiError(400, "Payment link must be a valid http/https URL"));
    }

    if (statusChanged && existing.status === "approved" && status === "closed") {
        const closedResult = await closeApprovedRequestAndActivatePlan({
            requestId: existing.id,
            actedBy: req.user?.email || req.user?.username || "admin",
            paymentSessionId: existing.paymentSessionId,
            paymentStatus: existing.paymentStatus || "paid",
            paymentProvider: existing.paymentProvider || "manual",
            paymentLink: normalizedPaymentLink || existing.paymentLink,
            adminResponse,
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    closedResult?.request || existing,
                    "Upgrade request updated successfully"
                )
            );
    }

    const updatedRequest = await prisma.planUpgradeRequest.update({
        where: { id },
        data: {
            status,
            adminResponse: adminResponse?.trim() || null,
            paymentLink: normalizedPaymentLink,
            paymentStatus:
                status === "approved"
                    ? existing.paymentStatus || "pending"
                    : status === "rejected"
                      ? "canceled"
                      : existing.paymentStatus,
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (statusChanged && ["approved", "rejected", "closed"].includes(status)) {
        const targetUser = await prisma.user.findUnique({
            where: { id: updatedRequest.userId },
            select: {
                email: true,
                username: true,
                preferredLanguage: true,
            },
        });

        await notifyUserUpgradeRequestResolved({
            request: updatedRequest,
            user: targetUser,
            actedBy: req.user?.email || req.user?.username || "admin",
            locale: targetUser?.preferredLanguage || req.headers["accept-language"],
        });
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedRequest, "Upgrade request updated successfully"));
});

/**
 * POST /subscriptions/me/upgrade-requests/:id/epayco-verify
 *
 * Fallback called by PaymentSuccess.jsx when the confirmation webhook
 * hasn't arrived yet (common on Render free tier sleeping, test mode, etc.).
 *
 * Strategy:
 *  1. If already closed → return as-is
 *  2. If request is "approved" + paymentProvider contains "epayco"
 *     + paymentStatus is "pending" (not rejected/failed):
 *     → Activate the plan directly.
 *     The user reached this endpoint only after going through the ePayco
 *     checkout and being redirected back, so we can trust the payment happened.
 *  3. If paymentStatus is "rejected" or "failed" → do NOT activate.
 */
export const verifyAndActivateByEpayco = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    // Already done
    if (request.status === "closed") {
        const subscription = await ensureUserSubscription(req.user.prismaId);
        return res.status(200).json(new ApiResponse(200, {
            alreadyActivated: true,
            targetPlanActive: request.targetPlan === subscription.plan,
        }, "Plan already activated"));
    }

    if (request.status !== "approved") {
        return next(new ApiError(400, "Request is not in approved status"));
    }

    // Only activate ePayco requests that went through checkout and are pending
    const isEpaycoRequest =
        `${request.paymentProvider || ""}`.toLowerCase().includes("epayco");
    const isFailedPayment =
        ["rejected", "failed", "canceled"].includes(request.paymentStatus || "");

    if (!isEpaycoRequest || !request.paymentSessionId) {
        return next(new ApiError(400, "Not an ePayco checkout request"));
    }

    if (isFailedPayment) {
        return res.status(200).json(new ApiResponse(200, {
            paid: false,
            paymentStatus: request.paymentStatus,
        }, "Payment was not successful"));
    }

    // Activate — user reached this page via ePayco's redirect, payment confirmed
    await closeApprovedRequestAndActivatePlan({
        requestId: id,
        actedBy: "epayco-verify-fallback",
        paymentSessionId: request.paymentSessionId,
        paymentProvider: "epayco",
        paymentStatus: "paid",
    });

    const subscription = await ensureUserSubscription(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, {
        activated: true,
        targetPlanActive: request.targetPlan === subscription.plan,
    }, "Plan activated via ePayco verification"));
});

// =============================================================================
// ePayco handlers
// =============================================================================

/**
 * GET /subscriptions/me/upgrade-requests/:id/epayco-params
 *
 * Returns the parameters needed by the ePayco JS widget.
 * Protected by JWT — only the owner of the upgrade request can fetch them.
 * The reference (paymentSessionId) is read from the DB so it is stable
 * across page refreshes.
 */
export const getEpaycoCheckoutParams = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    if (!isEpaycoConfigured()) {
        return next(new ApiError(503, "ePayco is not configured on this server"));
    }

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (request.status !== "approved") {
        return next(new ApiError(409, "Checkout is only available for approved upgrade requests"));
    }

    // paymentSessionId is the ePayco reference stored when the checkout session was created
    if (!request.paymentSessionId) {
        return next(
            new ApiError(
                400,
                "Checkout session not initialized. Please click 'Pagar con ePayco' from the billing page first."
            )
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { email: true, username: true },
    });

    if (!user?.email) {
        return next(new ApiError(400, "A valid account email is required"));
    }

    const params = buildEpaycoWidgetParams({
        request,
        user,
        reference: request.paymentSessionId,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, params, "ePayco checkout params fetched successfully"));
});

/**
 * POST /subscriptions/payments/epayco/confirmation
 *
 * Server-to-server callback called by ePayco after every transaction event.
 * This is the ONLY trusted source of truth — never rely solely on the
 * Response URL (browser redirect) to activate a plan.
 *
 * Security:
 *  - Validates SHA-256 signature using private key (never exposed to the client)
 *  - Idempotent: if the request is already closed/paid, returns 200 without re-processing
 *  - Always returns HTTP 200 so ePayco does not retry indefinitely
 */
export const handleEpaycoConfirmation = async (req, res) => {
    try {
        const data = req.body || {};

        const refPayco = `${data.x_ref_payco || ""}`.trim();
        const transactionId = `${data.x_transaction_id || ""}`.trim();
        const amount = `${data.x_amount || ""}`.trim();
        const currencyCode = `${data.x_currency_code || ""}`.trim();
        const signature = `${data.x_signature || ""}`.trim();
        const stateCode = parseInt(`${data.x_cod_transaction_state || 0}`, 10);
        const requestId = `${data.x_extra1 || ""}`.trim(); // set as p_extra1 during checkout

        // Reject incomplete payloads silently (ePayco test pings may be empty)
        if (!requestId || !refPayco || !transactionId || !signature) {
            console.warn("[epayco-confirmation] Incomplete payload — ignoring", {
                requestId,
                refPayco,
                transactionId,
                hasSignature: Boolean(signature),
            });
            return res.status(200).json({ success: false, message: "Incomplete payload" });
        }

        // Validate signature
        const custId = `${process.env.EPAYCO_P_CUST_ID || ""}`.trim();
        const privateKey = `${process.env.EPAYCO_PRIVATE_KEY || ""}`.trim();

        const signatureValid = validateEpaycoSignature({
            custId,
            privateKey,
            refPayco,
            transactionId,
            amount,
            currencyCode,
            signature,
        });

        if (!signatureValid) {
            console.warn("[epayco-confirmation] Invalid signature for requestId:", requestId);
            return res.status(200).json({ success: false, message: "Invalid signature" });
        }

        // Load the upgrade request
        const existingRequest = await prisma.planUpgradeRequest.findUnique({
            where: { id: requestId },
            select: { id: true, status: true, paymentSessionId: true, paymentStatus: true },
        });

        if (!existingRequest) {
            console.warn("[epayco-confirmation] Request not found:", requestId);
            return res.status(200).json({ success: false, message: "Request not found" });
        }

        // Idempotency guard: do not process the same successful payment twice
        if (existingRequest.status === "closed" && existingRequest.paymentStatus === "paid") {
            return res.status(200).json({ success: true, message: "Already processed" });
        }

        if (isEpaycoTransactionApproved(stateCode)) {
            // Transaction accepted — activate the plan
            await closeApprovedRequestAndActivatePlan({
                requestId,
                actedBy: "epayco-confirmation",
                paymentSessionId: refPayco,
                paymentProvider: "epayco",
                paymentStatus: "paid",
            });

            console.log("[epayco-confirmation] Plan activated for requestId:", requestId);
        } else if (stateCode === EPAYCO_STATE.REJECTED) {
            await prisma.planUpgradeRequest.updateMany({
                where: { id: requestId, status: "approved" },
                data: { paymentStatus: "rejected" },
            });
        } else if (stateCode === EPAYCO_STATE.FAILED) {
            await prisma.planUpgradeRequest.updateMany({
                where: { id: requestId, status: "approved" },
                data: { paymentStatus: "failed" },
            });
        }
        // stateCode === PENDING (3): no action — wait for the final confirmation

        return res.status(200).json({ success: true });
    } catch (error) {
        // Always return 200 to prevent ePayco from retrying indefinitely
        console.error("[epayco-confirmation] Unexpected error", error);
        return res.status(200).json({ success: false, message: "Processing error" });
    }
};

/**
 * GET|POST /subscriptions/payments/epayco/response
 *
 * Browser redirect called by ePayco after the user completes (or cancels)
 * the payment flow. This is NOT trusted for plan activation — use only to
 * redirect the user to the appropriate frontend page.
 *
 * x_extra1 contains our upgradeRequestId (set as p_extra1 during checkout).
 */
export const handleEpaycoResponse = (req, res) => {
    const data = req.method === "POST" ? req.body || {} : req.query || {};

    // Priority: x_extra1 (ePayco extra field) → requestId query param embedded in our URL
    const requestId =
        `${data.x_extra1 || data.extra1 || ""}`.trim() ||
        `${req.query.requestId || ""}`.trim();

    const stateCode = parseInt(
        `${data.x_cod_transaction_state || data.cod_transaction_state || 0}`,
        10
    );
    const frontendBase = `${process.env.FRONTEND_URL || "https://www.ohnix.co"}`.replace(/\/$/, "");

    if (!requestId) {
        return res.redirect(`${frontendBase}/billing`);
    }

    // Codes that are definitely a failure — ePayco sends these explicitly
    // 2=Rejected, 4=Failed, 6=Reversed, 9=Expired, 10=Abandoned
    const FAILED_STATES = new Set([2, 4, 6, 9, 10]);

    if (FAILED_STATES.has(stateCode)) {
        return res.redirect(
            `${frontendBase}/billing?payment=cancelled&requestId=${encodeURIComponent(requestId)}`
        );
    }

    // State 1=Accepted, 3=Pending, 7=Retained, 8=Started, or 0=unknown
    // (ePayco sometimes omits x_cod_transaction_state in test mode)
    // → Always go to success page; the polling there checks the real status
    //   via the confirmation webhook that already activated the plan.
    return res.redirect(
        `${frontendBase}/billing/payment-success?requestId=${encodeURIComponent(requestId)}`
    );
};