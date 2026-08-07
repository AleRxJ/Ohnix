import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    ensureUserSubscription,
    getEffectivePlan,
    getMonthBounds,
    getPlanLimits,
    getTeamSeatLimit,
} from "../middleware/pricing.middleware.js";
import {
    notifyAdminsUpgradeRequestCreated,
    notifyUserUpgradeRequestResolved,
    notifyUserPlanActivated,
    notifyUserPaymentFailed,
} from "../utils/upgradeRequestNotifications.js";
import {
    createUpgradeCheckoutSession as createUpgradeCheckoutSessionProvider,
    getAmountForPlanAndCurrency,
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
    getEpaycoAmount,
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
    // Paid plans renew every 30 days — set endsAt on activation.
    // For renewals (currentPlan === targetPlan), extend from the current endsAt
    // so the user doesn't lose unused days. Computed inside the transaction below.
    const SUBSCRIPTION_PERIOD_DAYS = 30;
    const defaultEndsAt = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

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

        // For renewals: extend from current endsAt so no days are lost
        const isRenewal = existing.currentPlan === existing.targetPlan;
        let endsAt = defaultEndsAt;
        if (isRenewal) {
            const currentSub = await tx.subscription.findUnique({
                where: { userId: existing.userId },
                select: { endsAt: true },
            });
            const base = currentSub?.endsAt && new Date(currentSub.endsAt) > new Date()
                ? new Date(currentSub.endsAt)   // still active → extend from expiry
                : new Date();                    // already expired → extend from now
            endsAt = new Date(base.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        }

        // Atomically claim the request before touching the subscription.
        // Postgres re-evaluates this WHERE clause against the latest
        // committed row when acquiring the update's row lock, so if two
        // concurrent callers (e.g. the ePayco confirmation webhook and the
        // epayco-verify fallback landing near-simultaneously) both passed
        // the `existing.status !== "approved"` check above, only one of
        // them will actually match here - the other gets count: 0 and
        // backs off instead of upserting the subscription a second time
        // and duplicating the renewal period.
        const claim = await tx.planUpgradeRequest.updateMany({
            where: { id: existing.id, status: "approved" },
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
        });

        if (claim.count === 0) {
            const current = await tx.planUpgradeRequest.findUnique({
                where: { id: existing.id },
                select: UPGRADE_REQUEST_SELECT,
            });
            return { request: current, activated: false };
        }

        await tx.subscription.upsert({
            where: { userId: existing.userId },
            update: {
                plan: existing.targetPlan,
                status: "active",
                endsAt,
                trialEndsAt: null,
            },
            create: {
                userId: existing.userId,
                plan: existing.targetPlan,
                status: "active",
                endsAt,
            },
        });

        const closedRequest = await tx.planUpgradeRequest.findUnique({
            where: { id: existing.id },
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
                endsAt: subscription.endsAt ?? null,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
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

        // Reactivating a paid plan must NOT clear endsAt. Doing so hid the
        // subscription from subscriptionRenewalScheduler's downgrade query
        // (`endsAt: { lt: cutoff }` never matches NULL), so a user could
        // pause/cancel a paid plan and reactivate it to get free, indefinite
        // access that no automated process would ever catch. Starter is a
        // paid plan too (see pricing.middleware.js PLAN_PRICES_USD), so it
        // gets no special case here - only a subscription that was never
        // paid at all (still endsAt: null, e.g. mid-trial) stays null.
        const nextEndsAt =
            status === "active" ? subscription.endsAt : subscription.endsAt || new Date();

        const updated = await prisma.subscription.update({
            where: { userId: req.user.prismaId },
            data: {
                status,
                endsAt: nextEndsAt,
                // Reactivating always undoes a pending cancel-at-period-end.
                ...(status === "active" && { cancelAtPeriodEnd: false }),
            },
            select: {
                plan: true,
                status: true,
                startedAt: true,
                endsAt: true,
                cancelAtPeriodEnd: true,
            },
        });

        return res.status(200).json(new ApiResponse(200, updated, message));
    });

// Pause is an explicit "stop using this right now" action - it cuts access
// immediately, same as before. Reactivate clears both `status` and any
// pending cancellation.
export const pauseMySubscription = setMyStatus(
    "paused",
    "Subscription paused successfully"
);

export const reactivateMySubscription = setMyStatus(
    "active",
    "Subscription reactivated successfully"
);

// Cancel means "don't renew", not "cut off what I already paid for". Unlike
// pause/reactivate above, this must NOT flip `status` away from "active" -
// ensureActiveSubscription (pricing.middleware.js) gates all plan features
// on status === "active", so doing that would revoke access the same
// instant a customer cancels, instead of at the end of the period they
// already paid for. Setting cancelAtPeriodEnd instead lets
// subscriptionRenewalScheduler's blockLapsedSubscriptions job block access
// once `endsAt` (+ grace period) actually passes - the same natural-expiry
// path a non-renewal would take, no scheduler changes needed.
export const cancelMySubscription = asyncHandler(async (req, res, next) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);

    // "Nothing to cancel" now means "no paid period in progress" rather than
    // "plan === starter" - Starter is a paid plan too (see pricing.middleware.js
    // PLAN_PRICES_USD), so a paying Starter subscriber can cancel just like
    // any other plan. Only a subscription that was never actually paid for
    // (still on the free trial, no endsAt yet) has nothing to cancel.
    if (!subscription.endsAt) {
        return next(
            new ApiError(400, "There is no active paid period to cancel.")
        );
    }

    const updated = await prisma.subscription.update({
        where: { userId: req.user.prismaId },
        data: { cancelAtPeriodEnd: true },
        select: {
            plan: true,
            status: true,
            startedAt: true,
            endsAt: true,
            cancelAtPeriodEnd: true,
        },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            updated,
            "Your plan will not renew, but you keep full access until it expires."
        )
    );
});

export const updateUserPlan = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { plan } = req.body;

    if (!plan || !["starter", "growth", "scale", "enterprise"].includes(plan)) {
        return next(new ApiError(400, "A valid plan is required"));
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, ownedTeam: { select: { id: true } } },
    });

    if (!targetUser) {
        return next(new ApiError(404, "Target user not found"));
    }

    // Downgrade block (decided over upgrade): a plan change that would leave
    // an owner with more active team members than the new plan's seat limit
    // allows is rejected outright - they must remove members first instead
    // of the system silently deciding who loses access.
    if (targetUser.ownedTeam) {
        const newSeatLimit = getTeamSeatLimit(plan);
        if (newSeatLimit !== null) {
            const activeMemberCount = await prisma.teamMember.count({
                where: { teamId: targetUser.ownedTeam.id, status: "active" },
            });
            if (activeMemberCount > newSeatLimit) {
                return next(
                    new ApiError(
                        409,
                        `No se puede cambiar al plan ${plan}: el equipo tiene ${activeMemberCount} miembro(s) activo(s), que supera el límite de ${newSeatLimit} de ese plan. Remueve miembros primero.`
                    )
                );
            }
        }
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

    if (!targetPlan || !["growth", "scale", "enterprise"].includes(targetPlan)) {
        return next(
            new ApiError(400, "A valid target plan is required (growth, scale or enterprise)")
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

    // A prior checkout for this request is still awaiting confirmation - a
    // second one would create a second real charge (or, for delayed methods
    // like PSE, a second pending bank transfer) for the same upgrade before
    // the first has even resolved. Let the existing payment resolve (or
    // expire/fail, which clears paymentStatus off "pending") before another
    // session can be created.
    if (request.paymentStatus === "pending") {
        return next(
            new ApiError(
                409,
                "A previous payment for this request is still being verified. Please wait for it to complete before trying again."
            )
        );
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

const extractUpgradeRequestId = (session) =>
    session?.metadata?.upgradeRequestId || session?.upgradeRequestId || session?.requestId;

// Shared by the immediate (checkout.session.completed) and deferred
// (checkout.session.async_payment_succeeded) success paths so the
// idempotency guard and amount/currency cross-check only live in one place.
const activateFromCheckoutSession = async ({ session, provider }) => {
    const upgradeRequestId = extractUpgradeRequestId(session);
    if (!upgradeRequestId) return;

    const existingRequest = await prisma.planUpgradeRequest.findUnique({
        where: { id: upgradeRequestId },
        select: { id: true, status: true, paymentStatus: true, targetPlan: true },
    });

    // Idempotency guard: a Stripe webhook can be redelivered - do not
    // reprocess a payment that already activated the plan.
    const alreadyProcessed =
        existingRequest?.status === "closed" && existingRequest?.paymentStatus === "paid";

    if (!existingRequest || alreadyProcessed) return;

    // A verified Stripe signature proves the payload wasn't tampered with in
    // transit, but not that the checkout session was actually created for
    // the price this plan costs - cross-check the paid amount/currency the
    // same way the ePayco confirmation path already does, as a
    // defense-in-depth guard against a bug elsewhere in checkout-session
    // creation activating the wrong plan.
    let amountOk = true;
    if (provider === "stripe") {
        const currency = `${session?.currency || ""}`.toLowerCase();
        const expectedAmount = getAmountForPlanAndCurrency(existingRequest.targetPlan, currency);
        const paidAmount = Math.round(Number(session?.amount_total));
        amountOk =
            expectedAmount !== null &&
            Number.isFinite(paidAmount) &&
            Math.abs(paidAmount - expectedAmount) <= 1;
    }

    if (!amountOk) {
        console.error("[payment-webhook] Amount/currency mismatch — refusing to activate", {
            upgradeRequestId,
            targetPlan: existingRequest.targetPlan,
            currency: session?.currency,
            paidAmount: session?.amount_total,
        });
        await prisma.planUpgradeRequest.updateMany({
            where: { id: upgradeRequestId, status: "approved" },
            data: { paymentStatus: "amount_mismatch" },
        });
        return;
    }

    await closeApprovedRequestAndActivatePlan({
        requestId: upgradeRequestId,
        actedBy: "payment-webhook",
        paymentSessionId: session?.id || session?.sessionId || session?.reference,
        paymentProvider: provider,
        paymentStatus: "paid",
        paymentLink: session?.url || session?.checkoutUrl || session?.paymentUrl || null,
    });
};

const markCheckoutFailed = async ({ session, paymentStatus }) => {
    const upgradeRequestId = extractUpgradeRequestId(session);
    if (!upgradeRequestId) return;

    const updated = await prisma.planUpgradeRequest.updateMany({
        where: { id: upgradeRequestId, status: "approved" },
        data: { paymentStatus },
    });

    if (updated.count > 0) {
        const request = await prisma.planUpgradeRequest.findUnique({
            where: { id: upgradeRequestId },
            select: UPGRADE_REQUEST_SELECT,
        });
        const user = request
            ? await prisma.user.findUnique({
                  where: { id: request.userId },
                  select: { email: true, username: true, preferredLanguage: true },
              })
            : null;
        notifyUserPaymentFailed({ request, user, locale: user?.preferredLanguage }).catch(() => {});
    }
};

export const handlePaymentWebhook = async (req, res) => {
    try {
        const signature = req.headers["stripe-signature"];
        const event = parsePaymentWebhookEvent({
            rawBody: req.body,
            headers: req.headers,
            signature,
        });

        const provider = event?.provider || "stripe";
        const session = event.data?.object;

        if (
            event?.type === "checkout.session.completed" ||
            event?.type === "payment.succeeded"
        ) {
            // Stripe's delayed-notification payment methods (PSE, Bizum,
            // SEPA Debit - all configured in COUNTRY_CONFIG) fire
            // checkout.session.completed immediately on redirect with
            // payment_status "unpaid"; the real result only arrives later
            // via checkout.session.async_payment_succeeded/_failed below.
            // Activating here for those would grant access before - or
            // without - the payment actually clearing. This check only
            // applies to real Stripe events; co_direct's synthetic
            // "payment.succeeded" type has no payment_status field.
            const isUnconfirmedStripeSession =
                provider === "stripe" &&
                session?.payment_status &&
                session.payment_status !== "paid";

            if (!isUnconfirmedStripeSession) {
                await activateFromCheckoutSession({ session, provider });
            }
        }

        if (event?.type === "checkout.session.async_payment_succeeded") {
            await activateFromCheckoutSession({ session, provider });
        }

        if (event?.type === "checkout.session.async_payment_failed") {
            await markCheckoutFailed({ session, paymentStatus: "failed" });
        }

        if (
            event?.type === "checkout.session.expired" ||
            event?.type === "payment.failed"
        ) {
            await markCheckoutFailed({
                session,
                paymentStatus: event?.type === "payment.failed" ? "failed" : "expired",
            });
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
 * This used to activate the plan just because the user reached this
 * endpoint, on the theory that they could only have gotten here via
 * ePayco's redirect. That's false: any authenticated user could call this
 * route directly for any of their own "approved" requests without ever
 * paying. It now independently confirms the payment against ePayco's
 * transaction-query API (same one `queryEpaycoTransaction` was written for
 * but never wired up) before activating anything, mirroring what
 * `verifyAndActivateBySession` already does correctly for Stripe.
 *
 * NOTE: queryEpaycoTransaction was pointed at a URL that isn't a real ePayco
 * endpoint until 2026-08-06 (fixed in epayco.service.js - it returned HTML,
 * not JSON, confirmed in production logs). The correct endpoint
 * (/validation/v1/reference/{ref}) has no officially documented response
 * shape (see github.com/epayco/resources/issues/13), so the field lookup
 * below stays defensive - numeric state codes, Spanish field names, AND the
 * x_response string values ("Aceptada"/"Rechazada"/etc, confirmed in
 * ePayco's confirmation-webhook docs) are all checked - and logs the raw
 * payload whenever it can't confidently determine approval, so the next
 * failure is diagnosable from logs instead of guessing again.
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

    // Only attempt ePayco requests that went through checkout and are pending
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

    let transaction;
    try {
        transaction = await queryEpaycoTransaction(request.paymentSessionId);
    } catch (error) {
        console.error("[epayco-verify] Transaction query failed", { requestId: id, message: error.message });
        return next(new ApiError(502, "Could not verify the payment with ePayco. Please try again shortly."));
    }

    const txData = transaction?.data || transaction || {};
    const stateCode = parseInt(
        `${txData.x_cod_transaction_state ?? txData.cod_respuesta ?? txData.estado_codigo ?? 0}`,
        10
    );
    // Fallback for the undocumented validation/v1/reference response shape:
    // ePayco's own webhook docs confirm x_response is a Spanish status
    // string ("Aceptada"/"Rechazada"/"Pendiente"/"Fallida") - if no usable
    // numeric code came through, treat that string as authoritative too.
    const responseText = `${txData.x_response ?? txData.response ?? txData.estado ?? ""}`.trim().toLowerCase();
    const stateApproved =
        isEpaycoTransactionApproved(stateCode) ||
        (stateCode === 0 && ["aceptada", "accepted", "approved"].includes(responseText));

    const paidAmount = Number(txData.x_amount ?? txData.valor ?? txData.amount ?? 0);
    const currencyCode = `${txData.x_currency_code ?? txData.moneda ?? txData.currency ?? ""}`.toUpperCase();

    const expectedAmount = getEpaycoAmount(request.targetPlan);
    const amountMatches = expectedAmount !== null && Math.abs(Math.round(paidAmount) - expectedAmount) <= 1;
    const currencyMatches = currencyCode === "COP";

    if (!stateApproved || !amountMatches || !currencyMatches) {
        console.warn("[epayco-verify] Payment not confirmed by ePayco — refusing to activate", {
            requestId: id, stateCode, responseText, paidAmount, expectedAmount, currencyCode,
            // Full raw payload so a real failure is diagnosable from logs
            // instead of guessing at ePayco's undocumented field names again.
            rawTxData: txData,
        });
        return res.status(200).json(new ApiResponse(200, {
            paid: false,
            reason: !stateApproved ? "not_approved" : "amount_mismatch",
        }, "Payment could not be verified"));
    }

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

/**
 * POST /subscriptions/me/renew
 *
 * Creates an auto-approved renewal request for the current plan and
 * immediately returns a checkout URL. Handles the case where the
 * user's plan is still active (extends from endsAt) or already expired
 * (extends from now).
 */
export const createRenewalCheckout = asyncHandler(async (req, res, next) => {
    const { country, paymentMethod } = req.body || {};

    const subscription = await ensureUserSubscription(req.user.prismaId);

    if (!isAutonomousCheckoutConfigured()) {
        return next(new ApiError(503, "Autonomous checkout is not configured."));
    }

    // Block if there's already an open/approved request
    const existingOpen = await prisma.planUpgradeRequest.findFirst({
        where: {
            userId: req.user.prismaId,
            status: { in: ["open", "reviewing", "approved"] },
        },
        select: { id: true },
    });

    if (existingOpen) {
        return next(new ApiError(409, "Ya tienes una solicitud de upgrade en proceso."));
    }

    const requester = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { id: true, email: true, username: true },
    });

    if (!requester?.email) {
        return next(new ApiError(400, "Se requiere un email válido para el checkout."));
    }

    // Create auto-approved renewal request (currentPlan === targetPlan signals renewal)
    const request = await prisma.planUpgradeRequest.create({
        data: {
            userId: req.user.prismaId,
            currentPlan: subscription.plan,
            targetPlan: subscription.plan,
            status: "approved",
            adminResponse: "Renovación automática. Completa el pago para extender tu plan 30 días.",
            paymentStatus: "awaiting_checkout",
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    let checkout;
    try {
        checkout = await createUpgradeCheckoutSessionProvider({
            request,
            user: requester,
            country: country || "CO",
            paymentMethod: paymentMethod || "epayco",
        });
    } catch (error) {
        // Clean up the created request if checkout fails
        await prisma.planUpgradeRequest.delete({ where: { id: request.id } }).catch(() => {});
        console.error("[renew] Checkout creation failed", error);
        return next(new ApiError(502, error?.message || "No se pudo crear el checkout de renovación."));
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

    return res.status(200).json(new ApiResponse(200, {
        requestId: request.id,
        checkoutUrl: checkout.checkoutUrl,
        provider: checkout.provider,
        currentPlan: subscription.plan,
    }, "Checkout de renovación creado correctamente."));
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

        // Validate signature. EPAYCO_P_KEY is the dedicated signing secret
        // ePayco uses for this checksum - distinct from EPAYCO_PRIVATE_KEY
        // (used for REST API auth) - see getEpaycoConfig in epayco.service.js.
        const custId = `${process.env.EPAYCO_P_CUST_ID || ""}`.trim();
        const privateKey = `${process.env.EPAYCO_P_KEY || process.env.EPAYCO_PRIVATE_KEY || ""}`.trim();

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
            select: { id: true, status: true, paymentSessionId: true, paymentStatus: true, targetPlan: true },
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
            // The signature only proves the payload wasn't tampered with in
            // transit - it says nothing about whether the amount actually
            // paid matches what this plan costs. Without this check, a
            // manipulated `amount` sent to ePayco's widget in the browser
            // (see EpaycoCheckout.jsx) would still produce a validly-signed
            // confirmation for whatever lower amount was actually charged.
            const expectedAmount = getEpaycoAmount(existingRequest.targetPlan);
            const paidAmount = Math.round(Number(amount));
            const amountMatches = expectedAmount !== null && Math.abs(paidAmount - expectedAmount) <= 1;
            const currencyMatches = currencyCode.toUpperCase() === "COP";

            if (!amountMatches || !currencyMatches) {
                console.error("[epayco-confirmation] Amount/currency mismatch — refusing to activate", {
                    requestId, targetPlan: existingRequest.targetPlan, expectedAmount, paidAmount, currencyCode,
                });
                await prisma.planUpgradeRequest.updateMany({
                    where: { id: requestId, status: "approved" },
                    data: { paymentStatus: "amount_mismatch" },
                });
                return res.status(200).json({ success: false, message: "Amount mismatch" });
            }

            // Transaction accepted — activate the plan
            await closeApprovedRequestAndActivatePlan({
                requestId,
                actedBy: "epayco-confirmation",
                paymentSessionId: refPayco,
                paymentProvider: "epayco",
                paymentStatus: "paid",
            });

            console.log("[epayco-confirmation] Plan activated for requestId:", requestId);
        } else if (stateCode === EPAYCO_STATE.REJECTED || stateCode === EPAYCO_STATE.FAILED) {
            const paymentStatus = stateCode === EPAYCO_STATE.REJECTED ? "rejected" : "failed";
            const updated = await prisma.planUpgradeRequest.updateMany({
                where: { id: requestId, status: "approved" },
                data: { paymentStatus },
            });

            if (updated.count > 0) {
                const failedRequest = await prisma.planUpgradeRequest.findUnique({
                    where: { id: requestId },
                    select: UPGRADE_REQUEST_SELECT,
                });
                const failedUser = failedRequest
                    ? await prisma.user.findUnique({
                          where: { id: failedRequest.userId },
                          select: { email: true, username: true, preferredLanguage: true },
                      })
                    : null;
                notifyUserPaymentFailed({
                    request: failedRequest,
                    user: failedUser,
                    locale: failedUser?.preferredLanguage,
                }).catch(() => {});
            }
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