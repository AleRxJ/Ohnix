import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    ensureUserSubscription,
    getMonthBounds,
    getPlanLimits,
} from "../middleware/pricing.middleware.js";
import {
    notifyAdminsUpgradeRequestCreated,
    notifyUserUpgradeRequestResolved,
} from "../utils/upgradeRequestNotifications.js";
import {
    createUpgradeCheckoutSession as createUpgradeCheckoutSessionProvider,
    getSupportedPaymentMethodsByCountry,
    isAutonomousCheckoutConfigured,
    parseStripeWebhookEvent,
} from "../services/payment.service.js";

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

const getUsageSnapshot = async (userId, plan) => {
    const limits = getPlanLimits(plan);
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
        plan,
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
                endsAt: null,
            },
            create: {
                userId: existing.userId,
                plan: existing.targetPlan,
                status: "active",
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
    }

    return result;
};

export const getMySubscription = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                plan: subscription.plan,
                status: subscription.status,
                limits: getPlanLimits(subscription.plan),
            },
            "Subscription fetched successfully"
        )
    );
});

export const getMyUsage = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);

    const usage = await getUsageSnapshot(req.user.prismaId, subscription.plan);

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
    const usage = await getUsageSnapshot(targetUser.id, subscription.plan);

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

export const handlePaymentWebhook = async (req, res) => {
    try {
        const signature = req.headers["stripe-signature"];
        const event = parseStripeWebhookEvent({
            rawBody: req.body,
            signature,
        });

        if (event?.type === "checkout.session.completed") {
            const session = event.data?.object;
            const upgradeRequestId = session?.metadata?.upgradeRequestId;

            if (upgradeRequestId) {
                await closeApprovedRequestAndActivatePlan({
                    requestId: upgradeRequestId,
                    actedBy: "payment-webhook",
                    paymentSessionId: session.id,
                    paymentProvider: "stripe",
                    paymentStatus: "paid",
                    paymentLink: session.url || null,
                });
            }
        }

        if (event?.type === "checkout.session.expired") {
            const session = event.data?.object;
            const upgradeRequestId = session?.metadata?.upgradeRequestId;

            if (upgradeRequestId) {
                await prisma.planUpgradeRequest.updateMany({
                    where: {
                        id: upgradeRequestId,
                        status: "approved",
                    },
                    data: {
                        paymentStatus: "expired",
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