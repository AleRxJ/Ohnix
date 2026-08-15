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
    PLAN_DISPLAY_NAMES,
    PLAN_PRICES_USD,
    PLAN_LIMITS,
    PLAN_FEATURES,
    TEAM_SEAT_LIMITS,
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
    getStripeCheckoutSessionState,
    getSupportedPaymentMethodsByCountry,
    isAutonomousCheckoutConfigured,
    parsePaymentWebhookEvent,
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

export const UPGRADE_REQUEST_SELECT = {
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

    // Team seats aren't in PLAN_LIMITS (they come from the separate
    // TEAM_SEAT_LIMITS map) and only apply to a user who actually owns a
    // team - a solo/no-team account or an invited member gets no row at all
    // instead of a misleading "0 / 3".
    const ownedTeam = await prisma.team.findUnique({
        where: { ownerId: userId },
        select: { id: true },
    });
    if (ownedTeam) {
        const [activeMembers, pendingInvitations] = await Promise.all([
            prisma.teamMember.count({ where: { teamId: ownedTeam.id, status: "active" } }),
            prisma.teamInvitation.count({
                where: { teamId: ownedTeam.id, status: "pending", expiresAt: { gt: new Date() } },
            }),
        ]);
        const seatsUsed = activeMembers + pendingInvitations;
        const seatLimit = getTeamSeatLimit(effectivePlan);
        withProgress.teamSeats = {
            used: seatsUsed,
            limit: seatLimit,
            remaining: seatLimit === null ? null : Math.max(0, seatLimit - seatsUsed),
            usagePercent:
                seatLimit === null || seatLimit === 0
                    ? null
                    : Number(((seatsUsed / seatLimit) * 100).toFixed(2)),
        };
    }

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

// Writes a terminal (non-"paid") outcome for a pending payment and notifies
// the user. Guarded by `paymentStatus: "pending"` in the WHERE clause so a
// late/duplicate signal (e.g. a delayed webhook arriving after this same
// conclusion was already reached by the reconciliation fallback below, or
// vice versa) is a no-op instead of re-notifying or clobbering a status set
// by a different, possibly more specific, caller in the meantime.
const markUpgradeRequestPaymentFailed = async ({ upgradeRequestId, paymentStatus }) => {
    if (!upgradeRequestId) return;

    const updated = await prisma.planUpgradeRequest.updateMany({
        where: { id: upgradeRequestId, status: "approved", paymentStatus: "pending" },
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
        notifyUserPaymentFailed({
            request,
            user,
            locale: user?.preferredLanguage,
            reason: paymentStatus,
        }).catch(() => {});
    }
};

// A checkout session that has sat at paymentStatus "pending" this long is no
// longer trusted even if the provider never sent (or we never received) a
// definitive signal - this is the hard ceiling that guarantees a customer
// can never be stuck indefinitely. Generous enough to not cut off slow
// bank-transfer methods (PSE etc. can legitimately take hours per their own
// docs) while still bounding the worst case to under 2 days instead of
// forever.
const PENDING_PAYMENT_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48h

// The single source of truth for "is this pending payment actually still
// pending". Re-verifies directly against the provider (Stripe / ePayco) and
// writes back whatever it finds, instead of trusting a `paymentStatus`
// column that - before this function existed - was only ever moved off
// "pending" by a webhook, and stayed stuck forever whenever one never
// arrived (misconfigured/unreachable endpoint, user just closed the
// checkout tab with no corresponding provider event, delivery lost, ...).
//
// Called from every place that reads or depends on paymentStatus === "pending":
// the two frontend "verify now" fallbacks, the checkout-status endpoint (so
// merely refreshing the Billing page self-heals), the guards that block a
// new checkout attempt while one is "in flight", and the periodic
// reconciliation job - so there is no single point of failure this
// depends on.
//
// Idempotent and safe to call repeatedly / concurrently: every write goes
// through markUpgradeRequestPaymentFailed or closeApprovedRequestAndActivatePlan,
// both of which re-check status/paymentStatus in their own WHERE clause
// before writing.
export const resolvePendingPaymentStatus = async (request) => {
    if (!request || request.status !== "approved" || request.paymentStatus !== "pending") {
        return request;
    }

    const provider = `${request.paymentProvider || ""}`.toLowerCase();
    const pendingSinceMs = new Date(request.updatedAt || request.createdAt).getTime();
    const isStale =
        Number.isFinite(pendingSinceMs) &&
        Date.now() - pendingSinceMs > PENDING_PAYMENT_TIMEOUT_MS;

    try {
        if (provider.startsWith("stripe") && request.paymentSessionId) {
            const { paid, status, session } = await getStripeCheckoutSessionState(
                request.paymentSessionId
            );

            if (paid) {
                // Same defense-in-depth amount/currency cross-check the
                // webhook path already does (activateFromCheckoutSession) -
                // a verified session still doesn't prove it was created for
                // the price this plan actually costs.
                const currency = `${session?.currency || ""}`.toLowerCase();
                const expectedAmount = getAmountForPlanAndCurrency(request.targetPlan, currency);
                const paidAmount = Math.round(Number(session?.amount_total));
                const amountOk =
                    expectedAmount !== null &&
                    Number.isFinite(paidAmount) &&
                    Math.abs(paidAmount - expectedAmount) <= 1;

                if (!amountOk) {
                    console.error(
                        "[payment-reconcile] Stripe amount/currency mismatch — refusing to activate",
                        { requestId: request.id, targetPlan: request.targetPlan, currency, paidAmount }
                    );
                    await markUpgradeRequestPaymentFailed({
                        upgradeRequestId: request.id,
                        paymentStatus: "amount_mismatch",
                    });
                    return { ...request, paymentStatus: "amount_mismatch" };
                }

                await closeApprovedRequestAndActivatePlan({
                    requestId: request.id,
                    actedBy: "payment-reconcile",
                    paymentSessionId: request.paymentSessionId,
                    paymentProvider: "stripe",
                    paymentStatus: "paid",
                });
                return { ...request, status: "closed", paymentStatus: "paid" };
            }

            if (status === "expired") {
                await markUpgradeRequestPaymentFailed({
                    upgradeRequestId: request.id,
                    paymentStatus: "expired",
                });
                return { ...request, paymentStatus: "expired" };
            }

            // status === "open": genuinely still awaiting the customer -
            // fall through to the staleness check below instead of
            // resolving anything here.
        } else if (provider.startsWith("epayco") && request.paymentSessionId) {
            const transaction = await queryEpaycoTransaction(request.paymentSessionId);
            const txData = transaction?.data || transaction || {};
            const stateCode = parseInt(
                `${txData.x_cod_transaction_state ?? txData.cod_respuesta ?? txData.estado_codigo ?? 0}`,
                10
            );
            const responseText = `${txData.x_response ?? txData.response ?? txData.estado ?? ""}`
                .trim()
                .toLowerCase();
            const approved =
                isEpaycoTransactionApproved(stateCode) ||
                (stateCode === 0 && ["aceptada", "accepted", "approved"].includes(responseText));

            if (approved) {
                const paidAmount = Number(txData.x_amount ?? txData.valor ?? txData.amount ?? 0);
                const currencyCode = `${
                    txData.x_currency_code ?? txData.moneda ?? txData.currency ?? ""
                }`.toUpperCase();
                const expectedAmount = getEpaycoAmount(request.targetPlan);
                const amountOk =
                    expectedAmount !== null && Math.abs(Math.round(paidAmount) - expectedAmount) <= 1;
                const currencyOk = currencyCode === "COP";

                if (!amountOk || !currencyOk) {
                    console.error(
                        "[payment-reconcile] ePayco amount/currency mismatch — refusing to activate",
                        { requestId: request.id, targetPlan: request.targetPlan, paidAmount, currencyCode }
                    );
                    await markUpgradeRequestPaymentFailed({
                        upgradeRequestId: request.id,
                        paymentStatus: "amount_mismatch",
                    });
                    return { ...request, paymentStatus: "amount_mismatch" };
                }

                await closeApprovedRequestAndActivatePlan({
                    requestId: request.id,
                    actedBy: "payment-reconcile",
                    paymentSessionId: request.paymentSessionId,
                    paymentProvider: "epayco",
                    paymentStatus: "paid",
                });
                return { ...request, status: "closed", paymentStatus: "paid" };
            }

            // 2=Rejected, 4=Failed, 6=Reversed, 9=Expired, 10=Abandoned - all
            // terminal, all safe to free up for a retry immediately instead
            // of waiting on the confirmation webhook or the 48h ceiling.
            // Rejected is kept as its own paymentStatus (not lumped into
            // "failed") because the frontend copy and the payment-failed
            // email genuinely differ for the two - "your bank declined this"
            // needs different guidance than "our systems had a technical
            // error", and this path used to collapse both into "failed",
            // losing that distinction whenever the webhook was late/lost and
            // this reconcile path resolved the payment instead.
            const TERMINAL_FAILED_STATES = new Set([
                EPAYCO_STATE.REJECTED,
                EPAYCO_STATE.FAILED,
                EPAYCO_STATE.REVERSED,
                EPAYCO_STATE.EXPIRED,
                EPAYCO_STATE.ABANDONED,
            ]);

            if (TERMINAL_FAILED_STATES.has(stateCode)) {
                let paymentStatus;
                if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) {
                    paymentStatus = "expired";
                } else if (stateCode === EPAYCO_STATE.REJECTED) {
                    paymentStatus = "rejected";
                } else {
                    paymentStatus = "failed";
                }
                await markUpgradeRequestPaymentFailed({ upgradeRequestId: request.id, paymentStatus });
                return { ...request, paymentStatus };
            }

            // 3=Pending, 7=Retained, 8=Started: genuinely still processing -
            // fall through to the staleness check below.
        }
    } catch (error) {
        // A provider outage/timeout must not itself become a second reason
        // the customer stays stuck - fall through to the time-based safety
        // net below instead of throwing.
        console.warn(
            "[payment-reconcile] Provider verification failed, relying on timeout only",
            { requestId: request.id, provider, message: error?.message }
        );
    }

    if (isStale) {
        await markUpgradeRequestPaymentFailed({ upgradeRequestId: request.id, paymentStatus: "expired" });
        return { ...request, paymentStatus: "expired" };
    }

    return request;
};

// Single source of truth for "what does each plan actually include" - the
// frontend used to hand-duplicate a copy of PLAN_FEATURES (useSubscription.js)
// that could silently drift from this file, and never had numeric limits or
// prices mirrored at all, which is exactly why Billing.jsx had no real
// "your plan vs the next tier" comparison. Every tier's data ships in one
// response so the frontend can build that comparison without any more
// hand-copied config.
const PLAN_ORDER = ["starter", "growth", "scale", "enterprise"];

export const getPlanCatalog = asyncHandler(async (_req, res) => {
    const plans = PLAN_ORDER.map((planKey) => ({
        key: planKey,
        displayName: PLAN_DISPLAY_NAMES[planKey],
        priceUSD: PLAN_PRICES_USD[planKey],
        limits: PLAN_LIMITS[planKey],
        features: PLAN_FEATURES[planKey],
        teamSeats: TEAM_SEAT_LIMITS[planKey],
    }));

    return res.status(200).json(new ApiResponse(200, { plans }, "Plan catalog fetched successfully"));
});

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

    // A prior checkout for this request may still be awaiting confirmation -
    // a second one would create a second real charge (or, for delayed
    // methods like PSE, a second pending bank transfer) for the same
    // upgrade before the first has even resolved. Before trusting that
    // stale "pending" flag, actively re-verify it against the provider (and
    // fall back to the timeout ceiling) - this is the exact point where a
    // customer used to get stuck forever, because nothing else ever cleared
    // "pending" for the common cases (user just closed the checkout tab, a
    // webhook was never delivered, ...). Only block if it's still
    // genuinely pending after that check.
    if (request.paymentStatus === "pending") {
        const resolvedRequest = await resolvePendingPaymentStatus(request);

        if (resolvedRequest.status === "closed" && resolvedRequest.paymentStatus === "paid") {
            return next(new ApiError(409, "Your target plan is already active"));
        }

        if (resolvedRequest.paymentStatus === "pending") {
            return next(
                new ApiError(
                    409,
                    "A previous payment for this request is still being verified. Please wait for it to complete before trying again."
                )
            );
        }
        // Otherwise the previous attempt is now confirmed failed/expired -
        // fall through and let this request through to create a fresh one.
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

    // Self-healing read: the frontend polls this endpoint every few seconds
    // right after checkout (PaymentSuccess.jsx) and again whenever the
    // Billing page loads, so re-verifying a "pending" payment here - instead
    // of only ever reporting the stale DB value - is what actually resolves
    // most stuck cases in practice, without the customer needing to do
    // anything beyond what they already do (wait on that page / come back
    // to Billing).
    const resolvedRequest = await resolvePendingPaymentStatus(request);
    const subscription = await ensureUserSubscription(req.user.prismaId);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                request: resolvedRequest,
                subscription: {
                    plan: subscription.plan,
                    status: subscription.status,
                    limits: getPlanLimits(subscription.plan),
                },
                targetPlanActive:
                    resolvedRequest.targetPlan === subscription.plan &&
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
            paid: request.paymentStatus === "paid",
            paymentStatus: request.paymentStatus,
            targetPlanActive: request.targetPlan === subscription.plan,
        }, "Plan already activated"));
    }

    if (request.status !== "approved") {
        return next(new ApiError(400, "Request is not in approved status"));
    }

    // Re-verifies against Stripe directly (not just re-reads the DB) and, if
    // the payment is genuinely paid/failed/expired, writes that conclusion
    // back - this is what used to be missing: a "not paid" answer here
    // never touched paymentStatus, so the request stayed stuck at "pending"
    // even when the user actively asked to be checked.
    let resolved;
    try {
        resolved = await resolvePendingPaymentStatus(request);
    } catch (err) {
        console.error("[verify-activate] Stripe reconciliation failed:", err?.message);
        return next(new ApiError(502, "Could not verify payment with Stripe"));
    }

    if (resolved.status === "closed" && resolved.paymentStatus === "paid") {
        const subscription = await ensureUserSubscription(req.user.prismaId);
        return res.status(200).json(new ApiResponse(200, {
            activated: true,
            paid: true,
            paymentStatus: "paid",
            targetPlanActive: request.targetPlan === subscription.plan,
        }, "Plan activated successfully"));
    }

    return res.status(200).json(new ApiResponse(
        200,
        { paid: false, paymentStatus: resolved.paymentStatus },
        resolved.paymentStatus === "pending"
            ? "Payment not yet confirmed"
            : "Payment could not be confirmed"
    ));
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
    await markUpgradeRequestPaymentFailed({ upgradeRequestId, paymentStatus });
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

    // Only attempt ePayco requests that went through checkout
    const isEpaycoRequest =
        `${request.paymentProvider || ""}`.toLowerCase().includes("epayco");

    if (!isEpaycoRequest || !request.paymentSessionId) {
        return next(new ApiError(400, "Not an ePayco checkout request"));
    }

    if (request.paymentStatus !== "pending") {
        // Already resolved (paid/failed/rejected/expired/amount_mismatch) by
        // a previous webhook, poll, or this same fallback - report it as-is
        // instead of re-querying ePayco for nothing.
        return res.status(200).json(new ApiResponse(200, {
            paid: request.paymentStatus === "paid",
            paymentStatus: request.paymentStatus,
        }, "Payment was not successful"));
    }

    // Re-verifies against ePayco directly and, if the payment is genuinely
    // approved/rejected/failed/expired/abandoned, writes that conclusion
    // back - this is what used to be missing: a "not approved" answer here
    // never touched paymentStatus, so the request stayed stuck at "pending"
    // even when the user actively asked to be checked.
    let resolved;
    try {
        resolved = await resolvePendingPaymentStatus(request);
    } catch (error) {
        console.error("[epayco-verify] Transaction query failed", { requestId: id, message: error.message });
        return next(new ApiError(502, "Could not verify the payment with ePayco. Please try again shortly."));
    }

    if (resolved.status === "closed" && resolved.paymentStatus === "paid") {
        const subscription = await ensureUserSubscription(req.user.prismaId);
        return res.status(200).json(new ApiResponse(200, {
            activated: true,
            paid: true,
            targetPlanActive: request.targetPlan === subscription.plan,
        }, "Plan activated via ePayco verification"));
    }

    return res.status(200).json(new ApiResponse(200, {
        paid: false,
        paymentStatus: resolved.paymentStatus,
        reason: resolved.paymentStatus === "amount_mismatch" ? "amount_mismatch" : "not_approved",
    }, "Payment could not be verified"));
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

    // Block if there's already an open/reviewing/approved request - except
    // an "approved" one whose payment is stuck "pending" is worth actively
    // re-checking first: without this, a renewal whose earlier payment
    // attempt silently failed/expired (no webhook, tab closed, ...) would
    // block every future renewal attempt forever, same root cause as the
    // checkout-session guard above.
    const existingOpen = await prisma.planUpgradeRequest.findFirst({
        where: {
            userId: req.user.prismaId,
            status: { in: ["open", "reviewing", "approved"] },
        },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (existingOpen) {
        const isResolvableApproved =
            existingOpen.status === "approved" && existingOpen.paymentStatus === "pending";

        const resolvedExisting = isResolvableApproved
            ? await resolvePendingPaymentStatus(existingOpen)
            : existingOpen;

        const stillBlocking =
            !isResolvableApproved ||
            resolvedExisting.paymentStatus === "pending" ||
            (resolvedExisting.status === "closed" && resolvedExisting.paymentStatus === "paid");

        if (stillBlocking) {
            return next(new ApiError(409, "Ya tienes una solicitud de upgrade en proceso."));
        }
        // Otherwise the blocking request's payment just resolved to
        // failed/expired/amount_mismatch - it no longer blocks a fresh
        // renewal attempt.
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
        } else if (
            stateCode === EPAYCO_STATE.REJECTED ||
            stateCode === EPAYCO_STATE.FAILED ||
            stateCode === EPAYCO_STATE.REVERSED
        ) {
            // Rejected keeps its own paymentStatus (not lumped in with
            // Failed/Reversed) - "your bank declined this" and "our systems
            // had a technical error" need different guidance, both in the
            // frontend copy and the payment-failed email (see
            // upgradeRequestNotifications.js's PAYMENT_FAILED_COPY).
            const paymentStatus = stateCode === EPAYCO_STATE.REJECTED ? "rejected" : "failed";
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus });
        } else if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) {
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus: "expired" });
        } else if (
            stateCode === EPAYCO_STATE.PENDING ||
            stateCode === EPAYCO_STATE.RETAINED ||
            stateCode === EPAYCO_STATE.STARTED
        ) {
            // Genuinely still in flight (RETAINED can still resolve either
            // way pending ePayco's own review) - wait for the next
            // confirmation instead of writing anything. The 48h staleness
            // ceiling in resolvePendingPaymentStatus is the backstop if no
            // further confirmation ever arrives.
            console.log(
                `[epayco-confirmation] Non-terminal state ${stateCode} for requestId ${requestId} — waiting for final confirmation`
            );
        } else {
            console.warn(
                `[epayco-confirmation] Unrecognized transaction state ${stateCode} for requestId ${requestId}`
            );
        }

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