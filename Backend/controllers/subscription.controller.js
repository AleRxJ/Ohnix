import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logAdminAction } from "../utils/adminAudit.js";
import {
    ensureUserSubscription,
    getEffectivePlan,
    getMonthBounds,
    getPlanFeatures,
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
    getCurrencyForCountry,
    getStripeCheckoutSessionState,
    getSupportedPaymentMethodsByCountry,
    isAutonomousCheckoutConfigured,
    parsePaymentWebhookEvent,
    createStripeSetupSession,
} from "../services/payment.service.js";
import {
    buildEpaycoWidgetParams,
    isEpaycoConfigured,
    validateEpaycoSignature,
    queryEpaycoTransaction,
    getEpaycoAmount,
    EPAYCO_STATE,
    isEpaycoTransactionApproved,
    isEpaycoCancelledResponse,
    parseEpaycoTestFlag,
    getEpaycoPublicTokenizationConfig,
} from "../services/epayco.service.js";
import {
    deleteStoredCard,
    getPaymentMethodInfo,
    payRequestWithNewCard,
    replaceEpaycoCard,
    saveStripeCardFromCheckoutSession,
    setAutoRenew,
    SUPPORTED_DOC_TYPES,
} from "../services/subscriptionAutoRenew.service.js";

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

// Enterprise has no fixed price (PLAN_PRICES_USD.enterprise is null - see
// pricing.middleware.js) and no configured checkout amount in any currency,
// so it can never go through the automated checkout path. It always needs
// an admin to negotiate the amount/capacity and hand back a manual payment
// link (see updateUpgradeRequestAdmin below) - regardless of whether the
// requester checked "requires manual review" or what their free-text notes
// happened to say. Auto-approving one straight to "awaiting_checkout" used
// to send the requester to a checkout that could never succeed.
export const shouldRouteToManualReview = ({ targetPlan, requiresManualReview }) => {
    if (targetPlan === "enterprise") {
        return true;
    }

    return requiresManualReview === true;
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
    billingCycle: true,
    isTestPayment: true,
    paidAt: true,
    paidAmount: true,
    paidCurrency: true,
    periodStartsAt: true,
    periodEndsAt: true,
    isAutoCharge: true,
    createdAt: true,
    updatedAt: true,
};

const VALID_BILLING_CYCLES = ["MONTHLY", "ANNUAL"];

const normalizeBillingCycle = (value) =>
    VALID_BILLING_CYCLES.includes(value) ? value : "MONTHLY";

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

// MONTHLY renews every 30 days, ANNUAL ("paga 10, lleva 12") every 365 -
// keyed by PlanUpgradeRequest.billingCycle, read fresh inside the
// transaction below (not computed up front) since it depends on the request
// being activated.
const SUBSCRIPTION_PERIOD_DAYS_BY_CYCLE = { MONTHLY: 30, ANNUAL: 365 };

// `notify: false` is used by automatic renewals (subscriptionAutoRenew.service.js),
// which send their own receipt email instead of the "request resolved" /
// "plan activated" pair a checkout gets.
export const closeApprovedRequestAndActivatePlan = async ({
    requestId,
    actedBy,
    paymentSessionId,
    paymentStatus = "paid",
    paymentProvider = "stripe",
    paymentLink,
    adminResponse,
    isTestPayment,
    paidAmount,
    paidCurrency,
    notify = true,
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

        const periodDays = SUBSCRIPTION_PERIOD_DAYS_BY_CYCLE[existing.billingCycle] || 30;

        // For renewals: extend from current endsAt so no days are lost.
        // `base` is also the period's start - kept outside the `if` so a
        // straight upgrade (not a renewal) still gets a periodStartsAt of
        // "now" below instead of only renewals recording one.
        const isRenewal = existing.currentPlan === existing.targetPlan;
        let base = new Date();
        let endsAt = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
        if (isRenewal) {
            const currentSub = await tx.subscription.findUnique({
                where: { userId: existing.userId },
                select: { endsAt: true },
            });
            base = currentSub?.endsAt && new Date(currentSub.endsAt) > new Date()
                ? new Date(currentSub.endsAt)   // still active → extend from expiry
                : new Date();                    // already expired → extend from now
            endsAt = new Date(base.getTime() + periodDays * 24 * 60 * 60 * 1000);
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
                ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}),
                paymentLink: paymentLink || existing.paymentLink,
                paidAt: paymentStatus === "paid" ? new Date() : existing.paidAt,
                // Snapshot of the period THIS payment covers - the
                // Subscription row's own endsAt gets overwritten on the
                // next renewal, so without this a request from a few
                // renewals ago has no way to say what it actually covered
                // (see the Prisma model comment). Only meaningful when a
                // real payment just activated the plan.
                periodStartsAt: paymentStatus === "paid" ? base : existing.periodStartsAt,
                periodEndsAt: paymentStatus === "paid" ? endsAt : existing.periodEndsAt,
                // What was actually charged - only known by the caller when
                // a provider payload carried a verified amount/currency
                // (Stripe/ePayco activation paths); admin/manual closes pass
                // neither, so this stays whatever it already was (null on a
                // fresh row, per the Prisma model comment).
                paidAmount: paymentStatus === "paid" && paidAmount != null ? paidAmount : existing.paidAmount,
                paidCurrency: paymentStatus === "paid" && paidCurrency != null ? paidCurrency : existing.paidCurrency,
                // No fallback boilerplate text here - request_closed_paid
                // (Billing.jsx) already tells the customer this, translated,
                // from paymentStatus/paidAt/periodEndsAt. A literal English
                // fallback string here used to end up stored and shown
                // verbatim regardless of the viewer's language.
                adminResponse: adminResponse?.trim() || existing.adminResponse || null,
            },
        });

        if (claim.count === 0) {
            const current = await tx.planUpgradeRequest.findUnique({
                where: { id: existing.id },
                select: UPGRADE_REQUEST_SELECT,
            });
            return { request: current, activated: false };
        }

        // Closing the request is not by itself proof the customer paid - an
        // admin can close an "approved" request whose automated checkout
        // never actually completed (e.g. unsticking one still stuck at
        // paymentStatus "pending" because the customer abandoned checkout
        // and neither ePayco/Stripe ever sent a definitive signal - see
        // resolvePendingPaymentStatus's 48h backstop above). Before this
        // guard, closing such a request granted the target plan for free
        // regardless of what paymentStatus was actually passed in, because
        // this upsert ran unconditionally. Every OTHER caller of this
        // function already hardcodes paymentStatus: "paid" (webhook /
        // reconcile / verify-now paths), so this only changes behavior for
        // the one caller (the admin status-update endpoint) that can pass
        // anything else.
        if (paymentStatus === "paid") {
            await tx.subscription.upsert({
                where: { userId: existing.userId },
                update: {
                    plan: existing.targetPlan,
                    status: "active",
                    endsAt,
                    trialEndsAt: null,
                    billingCycle: existing.billingCycle,
                    // Any confirmed payment (automatic or manual) settles
                    // pending auto-renew retries for the period it covers.
                    renewalAttempts: 0,
                    nextRenewalAttemptAt: null,
                    lastRenewalError: null,
                },
                create: {
                    userId: existing.userId,
                    plan: existing.targetPlan,
                    status: "active",
                    endsAt,
                    billingCycle: existing.billingCycle,
                },
            });
        }

        const closedRequest = await tx.planUpgradeRequest.findUnique({
            where: { id: existing.id },
            select: UPGRADE_REQUEST_SELECT,
        });

        return { request: closedRequest, activated: paymentStatus === "paid" };
    });

    if (!result?.request) {
        return null;
    }

    if (result.activated && notify) {
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
// isTestPayment is optional and only ever set (never cleared) here - a
// caller that doesn't know the provider's test/live flag (e.g. the
// self-reported "customer closed the checkout" path) must not overwrite a
// value a more informed caller already recorded.
const markUpgradeRequestPaymentFailed = async ({ upgradeRequestId, paymentStatus, isTestPayment }) => {
    if (!upgradeRequestId) return;

    const updated = await prisma.planUpgradeRequest.updateMany({
        where: { id: upgradeRequestId, status: "approved", paymentStatus: "pending" },
        data: {
            paymentStatus,
            ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}),
        },
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

// A checkout session that has sat at paymentStatus "pending" this long,
// with NO confirmation from the provider that a real payment is actually in
// flight (customer never finished checkout, or we simply never heard back),
// is no longer trusted - this is the hard ceiling that guarantees a
// customer can never be stuck indefinitely for that case. Deliberately NOT
// used for a payment the provider has positively confirmed is genuinely
// still processing (see PENDING_PAYMENT_VERIFIED_PROCESSING_TIMEOUT_MS
// below) - PSE-style methods settle within hours, so 48h is already
// generous for "we heard nothing at all".
const PENDING_PAYMENT_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48h

// Some payment methods are legitimately slow even once the customer has
// fully submitted them - Stripe SEPA Direct Debit in particular can take up
// to 14 business days to clear (Stripe's own guidance), and ePayco can hold
// a transaction "Retenida" for its own fraud review. Auto-expiring one of
// these on the same 48h clock as an abandoned checkout would be actively
// dangerous: the customer sees "expired, try again", pays a second time
// with a different method, and the original slow payment then clears days
// later too - a real double charge, not just a UX annoyance. So once the
// provider has explicitly confirmed "this is real and still processing"
// (not merely "we have no news"), resolvePendingPaymentStatus never invents
// an "expired" verdict on our own clock - it only ever reports what the
// provider itself eventually says, bounded by this much longer ceiling
// purely as a backstop against the provider never answering at all.
const PENDING_PAYMENT_VERIFIED_PROCESSING_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

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

    // Set below whenever the provider itself confirms a real payment is in
    // flight (not merely "we got no answer") - see
    // PENDING_PAYMENT_VERIFIED_PROCESSING_TIMEOUT_MS for why that case must
    // never be auto-expired on the same clock as an abandoned checkout.
    let verifiedStillProcessing = false;

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
                const expectedAmount = getAmountForPlanAndCurrency(request.targetPlan, currency, request.billingCycle);
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
                    paidAmount,
                    paidCurrency: currency,
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

            // status === "complete" with payment_status still "unpaid" is
            // NOT the same as "open" - the customer already fully submitted
            // the checkout (e.g. authorized a SEPA Direct Debit mandate),
            // and Stripe is genuinely still waiting on the bank to clear it,
            // which can take days. Stripe's own async_payment_succeeded/
            // _failed webhook is the only thing allowed to resolve this -
            // our 48h clock must not invent an "expired" verdict while the
            // real payment might still land. Only a session still stuck at
            // "open" (customer never finished checkout at all) falls
            // through to that staleness check below.
            if (status === "complete") {
                verifiedStillProcessing = true;
            }
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
            const isTestPayment = parseEpaycoTestFlag(txData.x_test_request ?? txData.test_request);
            const approved =
                isEpaycoTransactionApproved(stateCode) ||
                (stateCode === 0 && ["aceptada", "accepted", "approved"].includes(responseText));

            if (approved) {
                const paidAmount = Number(txData.x_amount ?? txData.valor ?? txData.amount ?? 0);
                const currencyCode = `${
                    txData.x_currency_code ?? txData.moneda ?? txData.currency ?? ""
                }`.toUpperCase();
                const expectedAmount = getEpaycoAmount(request.targetPlan, request.billingCycle);
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
                        isTestPayment,
                    });
                    return { ...request, paymentStatus: "amount_mismatch" };
                }

                await closeApprovedRequestAndActivatePlan({
                    requestId: request.id,
                    actedBy: "payment-reconcile",
                    paymentSessionId: request.paymentSessionId,
                    paymentProvider: "epayco",
                    paymentStatus: "paid",
                    isTestPayment,
                    paidAmount: Math.round(paidAmount),
                    paidCurrency: "cop",
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
                EPAYCO_STATE.CANCELLED,
            ]);

            if (TERMINAL_FAILED_STATES.has(stateCode)) {
                let paymentStatus;
                if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) {
                    paymentStatus = "expired";
                } else if (stateCode === EPAYCO_STATE.REJECTED) {
                    paymentStatus = "rejected";
                } else if (stateCode === EPAYCO_STATE.CANCELLED) {
                    paymentStatus = "cancelled";
                } else {
                    paymentStatus = "failed";
                }
                await markUpgradeRequestPaymentFailed({ upgradeRequestId: request.id, paymentStatus, isTestPayment });
                return { ...request, paymentStatus };
            }

            const NON_TERMINAL_STATES = new Set([
                EPAYCO_STATE.PENDING,
                EPAYCO_STATE.RETAINED,
                EPAYCO_STATE.STARTED,
            ]);

            // Any other non-zero code - notably ePayco's "Cancelada" state
            // (customer backed out of checkout), which isn't covered by any
            // documented code above - is terminal from the customer's
            // perspective. Resolve it now instead of leaving them blocked
            // behind the "a payment is already in progress" guard until the
            // 48h staleness ceiling below finally kicks in. stateCode === 0
            // means the query didn't return a usable state at all (not a
            // real "unknown" transaction state), so that case still falls
            // through to the staleness check untouched.
            if (stateCode !== 0 && !NON_TERMINAL_STATES.has(stateCode)) {
                const paymentStatus = isEpaycoCancelledResponse(responseText) ? "cancelled" : "failed";
                await markUpgradeRequestPaymentFailed({ upgradeRequestId: request.id, paymentStatus, isTestPayment });
                return { ...request, paymentStatus };
            }

            // 3=Pending ("the customer already submitted a payment, e.g. a
            // PSE bank redirect, and we're waiting on the bank to confirm")
            // and 7=Retained ("ePayco itself is holding it for fraud
            // review") both mean a real payment attempt exists and is
            // genuinely still being decided - same class of risk as
            // Stripe's "complete but unpaid" above, so this must not be
            // auto-expired on the abandoned-checkout clock either. 8=Started
            // ("Iniciada") is the ambiguous one - a transaction record was
            // created but there's no confirmation the customer ever
            // actually submitted payment details, so it stays on the
            // regular staleness check instead of being trusted indefinitely.
            if (stateCode === EPAYCO_STATE.PENDING || stateCode === EPAYCO_STATE.RETAINED) {
                verifiedStillProcessing = true;
            }
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

    if (verifiedStillProcessing) {
        // The provider confirmed this is real and still in flight - only
        // its own eventual answer (webhook or a later call here) can
        // resolve it. The far-longer ceiling here exists purely so a
        // provider that never answers at all still doesn't block a
        // customer forever, not as a normal expectation.
        const isVeryStale =
            Number.isFinite(pendingSinceMs) &&
            Date.now() - pendingSinceMs > PENDING_PAYMENT_VERIFIED_PROCESSING_TIMEOUT_MS;

        if (isVeryStale) {
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: request.id, paymentStatus: "expired" });
            return { ...request, paymentStatus: "expired" };
        }

        return request;
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

// Public (unauthenticated) pricing for the marketing /precios page and any
// other pre-signup surface - mounted outside the verifyJWT router, see
// routes/pricing.routes.js. Currency is resolved from `country` via the same
// resolveCountryConfig() used at actual checkout time (payment.service.js),
// so a visitor's market always maps to the currency they'd really be
// charged: CO -> COP, Eurozone -> EUR, everything else -> USD.
//
// Amounts come from the same STRIPE_AMOUNT_*_<CURRENCY> env vars Stripe
// checkout charges (getAmountForPlanAndCurrency) - not a second hand-typed
// number - so the public price and the checkout price cannot drift apart.
// USD checkout amounts aren't configured yet (no STRIPE_AMOUNT_*_USD in
// .env), so for "rest of world" visitors this falls back to PLAN_PRICES_USD,
// the existing approved reference price already shown elsewhere in-app
// (SubscriptionPlanCard, PlanComparisonCard) - not a new invented number.
// Converts a raw Stripe/ePayco smallest-unit amount to a display amount for
// the given currency (COP has no minor unit, EUR/USD are cents) - shared by
// both the monthly and annual branches below so they can never diverge.
const toDisplayAmount = (rawAmount, currency) =>
    currency === "cop" ? rawAmount : rawAmount / 100;

export const getPublicPricing = asyncHandler(async (req, res) => {
    const currency = getCurrencyForCountry(req.query?.country);

    const plans = PLAN_ORDER.map((planKey) => {
        if (planKey === "enterprise") {
            // Always custom/consultative pricing - never shown as a fixed
            // number on the public pricing page, regardless of market.
            return {
                key: planKey,
                currency,
                amount: null,
                monthlyAmount: null,
                annualAmount: null,
                source: "custom",
            };
        }

        const checkoutAmount = getAmountForPlanAndCurrency(planKey, currency, "MONTHLY");
        if (checkoutAmount !== null) {
            const monthlyAmount = toDisplayAmount(checkoutAmount, currency);
            // Annual is always monthly x10 ("paga 10, lleva 12") - recomputed
            // from the same checkout resolver used for Stripe/ePayco, not a
            // second hand-typed number, so it can never drift from what
            // checkout would actually charge for an annual request.
            const annualCheckoutAmount = getAmountForPlanAndCurrency(planKey, currency, "ANNUAL");
            const annualAmount = toDisplayAmount(annualCheckoutAmount, currency);
            return {
                key: planKey,
                currency,
                amount: monthlyAmount, // back-compat: same as monthlyAmount
                monthlyAmount,
                annualAmount,
                source: "checkout",
            };
        }

        if (currency === "usd" && PLAN_PRICES_USD[planKey] != null) {
            const monthlyAmount = PLAN_PRICES_USD[planKey];
            return {
                key: planKey,
                currency,
                amount: monthlyAmount,
                monthlyAmount,
                annualAmount: monthlyAmount * 10,
                source: "reference",
            };
        }

        return {
            key: planKey,
            currency,
            amount: null,
            monthlyAmount: null,
            annualAmount: null,
            source: "unavailable",
        };
    });

    return res.status(200).json(new ApiResponse(200, { currency, plans }, "Public pricing fetched successfully"));
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
                scheduledPlan: subscription.scheduledPlan ?? null,
                limits: getPlanLimits(effectivePlan),
                lowStockThreshold: subscription.lowStockThreshold ?? null,
                autoRenew: subscription.autoRenew ?? false,
                card: subscription.cardLast4
                    ? { brand: subscription.cardBrand, last4: subscription.cardLast4 }
                    : null,
                renewalAttempts: subscription.renewalAttempts ?? 0,
            },
            "Subscription fetched successfully"
        )
    );
});

// Account-wide low-stock threshold (Escala+ feature, same gate as the
// per-product override in product.controller.js#resolveLowStockThreshold) -
// null clears the override and falls back to the platform-wide default an
// admin controls via PUT /scheduler/threshold. Owner-only: this lives on the
// Subscription row (see companySelf.controller.js for why account-wide
// settings like this stay out of team members' hands even with billing:edit).
export const updateMyLowStockThreshold = asyncHandler(async (req, res, next) => {
    const { threshold } = req.body || {};

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const effectivePlan = getEffectivePlan(subscription);
    const canConfigure = req.user.role === "admin" || getPlanFeatures(effectivePlan).configurableAlerts;

    if (!canConfigure) {
        return next(
            new ApiError(403, "El umbral general de alertas de stock bajo está disponible desde el plan Escala.")
        );
    }

    const value = threshold === null || threshold === "" ? null : Number(threshold);
    if (value !== null && (!Number.isFinite(value) || value < 1)) {
        return next(new ApiError(400, "El umbral debe ser un número positivo."));
    }

    const updated = await prisma.subscription.update({
        where: { userId: req.user.prismaId },
        data: { lowStockThreshold: value },
        select: { lowStockThreshold: true },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "Umbral actualizado correctamente"));
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
                // An explicit pause also stops automatic charges - otherwise
                // the next retry would charge the card and silently undo it.
                ...(status === "paused" && { autoRenew: false, nextRenewalAttemptAt: null }),
            },
            select: {
                plan: true,
                status: true,
                startedAt: true,
                endsAt: true,
                cancelAtPeriodEnd: true,
                scheduledPlan: true,
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
            scheduledPlan: true,
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

// "Bajar de plan" - distinct from cancelMySubscription above: the customer
// stays an active, paying customer, just on a lower tier - not "stop
// billing me entirely". Takes effect at the CURRENT period's end (no
// proration, no immediate charge - this system has no stored payment
// method to auto-bill anyway), by recording scheduledPlan for
// blockLapsedSubscriptions to apply once endsAt actually lapses. Full
// access to the current (higher) plan is untouched until then.
export const downgradeMySubscription = asyncHandler(async (req, res, next) => {
    const { targetPlan } = req.body || {};

    if (!PLAN_ORDER.includes(targetPlan)) {
        return next(new ApiError(400, "A valid targetPlan is required"));
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);

    if (PLAN_ORDER.indexOf(targetPlan) >= PLAN_ORDER.indexOf(subscription.plan)) {
        return next(
            new ApiError(
                400,
                "targetPlan must be lower than your current plan. To move to a higher plan, request an upgrade instead."
            )
        );
    }

    if (!subscription.endsAt) {
        return next(
            new ApiError(400, "There is no active paid period to schedule a downgrade for.")
        );
    }

    const updated = await prisma.subscription.update({
        where: { userId: req.user.prismaId },
        data: { scheduledPlan: targetPlan },
        select: {
            plan: true,
            status: true,
            startedAt: true,
            endsAt: true,
            cancelAtPeriodEnd: true,
            scheduledPlan: true,
        },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            updated,
            "Seguirás con tu plan actual hasta que termine tu período pagado; después pasarás automáticamente al plan que elegiste."
        )
    );
});

// Undoes a pending scheduled downgrade - the counterpart to
// downgradeMySubscription above, for when the customer changes their mind
// before the current period actually lapses.
export const undoMyDowngrade = asyncHandler(async (req, res) => {
    const updated = await prisma.subscription.update({
        where: { userId: req.user.prismaId },
        data: { scheduledPlan: null },
        select: {
            plan: true,
            status: true,
            startedAt: true,
            endsAt: true,
            cancelAtPeriodEnd: true,
            scheduledPlan: true,
        },
    });

    return res.status(200).json(new ApiResponse(200, updated, "Cambio de plan cancelado."));
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

    const before = await ensureUserSubscription(targetUser.id);

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

    // Hand-setting a plan is the single most consequential admin action here
    // (instant, unpaid access to any plan including enterprise) - it had
    // zero trace anywhere before this.
    await logAdminAction({
        adminId: req.user.prismaId,
        action: "set_plan",
        targetType: "subscription",
        targetId: updated.userId,
        targetUserId: targetUser.id,
        metadata: { fromPlan: before.plan, toPlan: plan },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "User plan updated successfully"));
});

const SUBSCRIPTION_SELECT_ADMIN = {
    userId: true,
    plan: true,
    status: true,
    startedAt: true,
    endsAt: true,
    trialEndsAt: true,
    cancelAtPeriodEnd: true,
    scheduledPlan: true,
};

const findTargetUserOrFail = async (userId, next) => {
    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, username: true, company: { select: { id: true, name: true } } },
    });
    if (!targetUser) {
        next(new ApiError(404, "Target user not found"));
        return null;
    }
    return targetUser;
};

/**
 * GET /subscriptions/admin/users/:userId/subscription
 *
 * The single "what's actually active for this person right now" answer -
 * distinct from the payments ledger's per-attempt history (getAdminPayments),
 * which has no way on its own to say which of a user's several upgrade
 * requests over time is the one currently in effect. Includes company (if
 * any) so the admin can tell a business account from an individual one at a
 * glance - the same relation the payments ledger now surfaces per row.
 */
export const getUserSubscriptionAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const subscription = await ensureUserSubscription(targetUser.id);

    return res.status(200).json(
        new ApiResponse(200, { user: targetUser, subscription }, "User subscription fetched successfully")
    );
});

/**
 * GET /subscriptions/admin/users/:userId/audit-log
 *
 * "Who did what to this person and when" - see AdminAuditLog / logAdminAction
 * (Backend/utils/adminAudit.js). Every cancel/extend/uncancel, hand-set
 * plan, payment re-verify, and upgrade-request status change on this user
 * shows up here with which admin did it.
 */
export const getUserAuditLogAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const entries = await prisma.adminAuditLog.findMany({
        where: { targetUserId: targetUser.id },
        select: {
            id: true,
            action: true,
            targetType: true,
            targetId: true,
            metadata: true,
            createdAt: true,
            admin: { select: { id: true, email: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
    });

    return res.status(200).json(new ApiResponse(200, { entries }, "Audit log fetched successfully"));
});

/**
 * POST /subscriptions/admin/users/:userId/subscription/cancel
 *
 * Admin-initiated version of cancelMySubscription (same endpoint's self-
 * service twin, above) - identical semantics on purpose: cancelAtPeriodEnd,
 * NOT an immediate cutoff. The customer keeps access through what they
 * already paid for; subscriptionRenewalScheduler blocks access once endsAt
 * actually passes, the same natural-expiry path a non-renewal would take.
 */
export const cancelUserSubscriptionAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const subscription = await ensureUserSubscription(targetUser.id);

    if (!subscription.endsAt) {
        return next(new ApiError(400, "There is no active paid period to cancel."));
    }

    const updated = await prisma.subscription.update({
        where: { userId: targetUser.id },
        data: { cancelAtPeriodEnd: true },
        select: SUBSCRIPTION_SELECT_ADMIN,
    });

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "cancel_subscription",
        targetType: "subscription",
        targetId: targetUser.id,
        targetUserId: targetUser.id,
        metadata: { plan: updated.plan, endsAt: updated.endsAt },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            updated,
            "Subscription will not renew, but the customer keeps access until it expires."
        )
    );
});

/**
 * POST /subscriptions/admin/users/:userId/subscription/uncancel
 *
 * Undoes a pending cancelAtPeriodEnd - the counterpart to cancel above, for
 * when the cancellation was a mistake or the customer changed their mind.
 */
export const uncancelUserSubscriptionAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const updated = await prisma.subscription.update({
        where: { userId: targetUser.id },
        data: { cancelAtPeriodEnd: false },
        select: SUBSCRIPTION_SELECT_ADMIN,
    });

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "uncancel_subscription",
        targetType: "subscription",
        targetId: targetUser.id,
        targetUserId: targetUser.id,
        metadata: { plan: updated.plan },
    });

    return res.status(200).json(new ApiResponse(200, updated, "Cancellation undone."));
});

/**
 * POST /subscriptions/admin/users/:userId/subscription/extend
 *
 * Pushes endsAt out by `days` (body param, 1-365). Extends from the current
 * endsAt if it's still in the future, or from now if it already lapsed or
 * was never set - the same "don't lose unused days" logic
 * closeApprovedRequestAndActivatePlan already uses for renewals. Also clears
 * a pending cancelAtPeriodEnd and ensures status is active: extending a
 * subscription that's mid-cancellation should mean "keep this customer
 * going", not "give the cancellation a longer runway".
 */
export const extendUserSubscriptionAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const days = parseInt(req.body?.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
        return next(new ApiError(400, "days must be a number between 1 and 365"));
    }

    const subscription = await ensureUserSubscription(targetUser.id);
    const base =
        subscription.endsAt && new Date(subscription.endsAt) > new Date()
            ? new Date(subscription.endsAt)
            : new Date();
    const endsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const updated = await prisma.subscription.update({
        where: { userId: targetUser.id },
        data: { endsAt, status: "active", cancelAtPeriodEnd: false },
        select: SUBSCRIPTION_SELECT_ADMIN,
    });

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "extend_subscription",
        targetType: "subscription",
        targetId: targetUser.id,
        targetUserId: targetUser.id,
        metadata: { days, previousEndsAt: subscription.endsAt, newEndsAt: updated.endsAt },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, `Subscription extended by ${days} day(s).`));
});

/**
 * POST /subscriptions/admin/users/:userId/subscription/shorten
 *
 * Counterpart to extendUserSubscriptionAdmin above: pulls endsAt in by
 * `days` (body param, 1-365). Requires an existing endsAt - there's
 * nothing to shorten off of "no expiration". Floors at startedAt so an
 * admin can't move the date earlier than the subscription actually began.
 * Deliberately leaves status/cancelAtPeriodEnd untouched: shortening isn't
 * a cancellation, and subscriptionRenewalScheduler will pause access on its
 * own once the new endsAt lapses (no proration/credit exists in this
 * system, so the caller is expected to warn the admin before confirming).
 */
export const shortenUserSubscriptionAdmin = asyncHandler(async (req, res, next) => {
    const targetUser = await findTargetUserOrFail(req.params.userId, next);
    if (!targetUser) return;

    const days = parseInt(req.body?.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
        return next(new ApiError(400, "days must be a number between 1 and 365"));
    }

    const subscription = await ensureUserSubscription(targetUser.id);
    if (!subscription.endsAt) {
        return next(new ApiError(400, "This subscription has no end date to shorten."));
    }

    const startedAt = new Date(subscription.startedAt);
    const requested = new Date(new Date(subscription.endsAt).getTime() - days * 24 * 60 * 60 * 1000);
    const endsAt = requested < startedAt ? startedAt : requested;

    const updated = await prisma.subscription.update({
        where: { userId: targetUser.id },
        data: { endsAt },
        select: SUBSCRIPTION_SELECT_ADMIN,
    });

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "shorten_subscription",
        targetType: "subscription",
        targetId: targetUser.id,
        targetUserId: targetUser.id,
        metadata: { days, previousEndsAt: subscription.endsAt, newEndsAt: updated.endsAt },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, `Subscription shortened by ${days} day(s).`));
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

// Annual checkouts don't prorate (same no-proration policy this codebase
// already applies to every upgrade, see the comment below) - upgrading away
// from an ANNUAL plan mid-cycle would forfeit up to ~10 months of prepaid
// time with nothing given back, since there's no stored payment method to
// partially refund. Self-service blocks that case and routes to support
// instead; once under a month remains, it's cheap enough to just let the
// normal upgrade flow (and its own no-proration policy) handle it.
const ANNUAL_UPGRADE_LOCK_DAYS = 30;

export const createUpgradeRequest = asyncHandler(async (req, res, next) => {
    const { targetPlan, notes, requiresManualReview } = req.body;
    const billingCycle = normalizeBillingCycle(req.body?.billingCycle);

    if (!targetPlan || !["growth", "scale", "enterprise"].includes(targetPlan)) {
        return next(
            new ApiError(400, "A valid target plan is required (growth, scale or enterprise)")
        );
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);

    if (subscription.plan === targetPlan) {
        return next(new ApiError(400, "You are already on this plan"));
    }

    if (
        subscription.billingCycle === "ANNUAL" &&
        subscription.endsAt &&
        new Date(subscription.endsAt).getTime() - Date.now() > ANNUAL_UPGRADE_LOCK_DAYS * 24 * 60 * 60 * 1000
    ) {
        return next(
            new ApiError(
                409,
                "You're on an annual plan with more than 30 days left - contact support to change plans mid-cycle, since upgrading here would forfeit your remaining prepaid time."
            )
        );
    }

    // This endpoint is upgrade-only - it charges immediately via checkout,
    // and nothing here ever validated that targetPlan actually ranks above
    // the current plan. The frontend's plan picker never offered a lower
    // tier, so this was unreachable through the UI, but a direct API call
    // could ask for a downgrade here and get charged the LOWER plan's price
    // while closeApprovedRequestAndActivatePlan's renewal math (which keys
    // off currentPlan === targetPlan) would treat it as a brand-new period
    // starting today - discarding any remaining paid days on the current,
    // higher plan with no proration. Downgrades have their own endpoint now
    // (downgradeMySubscription) that takes effect at the current period's
    // end instead - see Subscription.scheduledPlan.
    if (PLAN_ORDER.indexOf(targetPlan) <= PLAN_ORDER.indexOf(subscription.plan)) {
        return next(
            new ApiError(
                400,
                "targetPlan must be higher than your current plan. To move to a lower plan, use the downgrade endpoint instead."
            )
        );
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
            billingCycle,
            notes: trimmedNotes,
            status: requiresReview ? "open" : "approved",
            // No adminResponse boilerplate here - the frontend's
            // request_status_help_approved i18n string already says this,
            // translated. A hardcoded English sentence here used to render
            // as a second, untranslated line right next to it.
            adminResponse: null,
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

    // Self-healing read: re-verify any still-"pending" payment against its
    // provider every time this list loads (i.e. every time Billing.jsx
    // mounts or refreshes), instead of only ever reporting whatever the DB
    // last had. Before this, the only read path that actually re-checked a
    // pending payment was the exact `?payment=cancelled&requestId=...`
    // redirect handler in Billing.jsx - simply opening/reloading Billing
    // later showed a stale "still verifying" notice until the 15-min
    // reconcile job got to it. Same self-healing pattern already used by
    // getMyUpgradeCheckoutStatus for a single request, applied here to the
    // whole list.
    const resolvedRequests = await Promise.all(
        requests.map((request) =>
            request.status === "approved" && request.paymentStatus === "pending"
                ? resolvePendingPaymentStatus(request)
                : request
        )
    );

    return res
        .status(200)
        .json(new ApiResponse(200, resolvedRequests, "Upgrade requests fetched successfully"));
});

/**
 * PATCH /subscriptions/me/upgrade-requests/:id/cancel
 *
 * Lets the customer withdraw their own upgrade request while it's still
 * safe to do so: before it's been reviewed ("open"/"reviewing"), or after
 * approval but only while no payment is actually in flight
 * (paymentStatus !== "pending" - a checkout that's mid-verification must
 * resolve on its own first, since cancelling out from under a payment that
 * ends up succeeding a moment later would leave a paid, closed request).
 *
 * Deliberately does NOT reuse closeApprovedRequestAndActivatePlan - that
 * helper unconditionally activates the subscription on close (it backs the
 * admin panel's "close" action, which can represent a manually-confirmed
 * payment). A customer cancelling their own unpaid request must never
 * activate anything, so this only ever flips status -> "closed".
 */
export const cancelMyUpgradeRequest = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const existing = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: { id: true, status: true, paymentStatus: true },
    });

    if (!existing) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (existing.status === "approved" && existing.paymentStatus === "pending") {
        return next(
            new ApiError(
                409,
                "A payment for this request is still being verified. It can't be cancelled until that finishes."
            )
        );
    }

    if (!["open", "reviewing", "approved"].includes(existing.status)) {
        return next(new ApiError(409, "This request can no longer be cancelled"));
    }

    // Atomic re-check of the same condition in the WHERE clause, so a
    // payment that flips to "pending" between the read above and this write
    // (e.g. the customer clicks "Pagar" in another tab) loses the race
    // instead of getting silently cancelled out from under it.
    const updated = await prisma.planUpgradeRequest.updateMany({
        where: {
            id,
            userId: req.user.prismaId,
            OR: [
                { status: { in: ["open", "reviewing"] } },
                { status: "approved", paymentStatus: { not: "pending" } },
            ],
        },
        data: { status: "closed" },
    });

    if (updated.count === 0) {
        return next(
            new ApiError(
                409,
                "A payment for this request is still being verified. It can't be cancelled until that finishes."
            )
        );
    }

    const cancelledRequest = await prisma.planUpgradeRequest.findUnique({
        where: { id },
        select: UPGRADE_REQUEST_SELECT,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, cancelledRequest, "Upgrade request cancelled"));
});

// Fallback offered when a Negocio/Escala signup doesn't go through with
// payment (see registerUser in user.controller.js, which creates the
// subscription as a paused "no plan yet" placeholder for those signups
// instead of granting a trial) - lets that account start the Starter trial
// instead of forcing the customer through registration a second time.
//
// Eligibility is intentionally strict and mirrors registerUser's own
// starter-trial branch: only an account that has NEVER had a trial or a
// paid period (trialEndsAt AND endsAt both still null) qualifies. This is
// what stops the endpoint from being used to reset an already-used trial or
// to escape a lapsed paid subscription for free - once either date is ever
// set, it's set for good (closeApprovedRequestAndActivatePlan only clears
// trialEndsAt on activation, it never re-nulls endsAt).
export const startMyStarterTrial = asyncHandler(async (req, res, next) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);

    if (subscription.plan !== "starter" || subscription.trialEndsAt || subscription.endsAt) {
        return next(
            new ApiError(
                409,
                "This account already has a plan or has already used its free trial."
            )
        );
    }

    const pendingRequest = await prisma.planUpgradeRequest.findFirst({
        where: {
            userId: req.user.prismaId,
            status: { in: ["open", "reviewing", "approved"] },
        },
        select: { id: true, status: true, paymentStatus: true },
    });

    // Same protection cancelMyUpgradeRequest applies - a payment that's
    // still being verified might actually have succeeded, so don't let the
    // customer grab a free trial (and close the request out from under it)
    // while that's still unresolved.
    if (pendingRequest?.status === "approved" && pendingRequest.paymentStatus === "pending") {
        return next(
            new ApiError(
                409,
                "A payment for your pending request is still being verified. Please wait for it to complete before starting the free trial."
            )
        );
    }

    const TRIAL_DAYS = 14;
    const updated = await prisma.subscription.update({
        where: { userId: req.user.prismaId },
        data: {
            status: "active",
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
        select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            endsAt: true,
            cancelAtPeriodEnd: true,
            scheduledPlan: true,
            lowStockThreshold: true,
        },
    });

    if (pendingRequest) {
        await prisma.planUpgradeRequest.updateMany({
            where: { id: pendingRequest.id, status: pendingRequest.status },
            data: { status: "closed" },
        });
    }

    const effectivePlan = getEffectivePlan(updated);
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                plan: updated.plan,
                effectivePlan,
                status: updated.status,
                trialEndsAt: updated.trialEndsAt,
                endsAt: updated.endsAt ?? null,
                cancelAtPeriodEnd: updated.cancelAtPeriodEnd ?? false,
                scheduledPlan: updated.scheduledPlan ?? null,
                limits: getPlanLimits(effectivePlan),
                lowStockThreshold: updated.lowStockThreshold ?? null,
            },
            "Starter trial started successfully"
        )
    );
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

const PAYMENT_STATUS_VALUES = ["pending", "paid", "rejected", "failed", "expired", "cancelled", "amount_mismatch"];

/**
 * GET /subscriptions/admin/subscriptions
 *
 * Customer-centric counterpart to getAdminPayments below: one row per
 * subscriber (queries Subscription directly), not one row per payment
 * attempt. Answers "what plan does this person/company actually have right
 * now" directly, instead of making the admin infer it from a payments
 * ledger that could have several rows per user across months.
 */
export const getAdminSubscriptions = asyncHandler(async (req, res) => {
    const { plan, status, hasCompany, search, page, pageSize } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    const where = {};
    if (["starter", "growth", "scale", "enterprise"].includes(plan)) {
        where.plan = plan;
    }
    if (["active", "paused", "canceled"].includes(status)) {
        where.status = status;
    }

    const userWhere = {};
    if (hasCompany === "true") {
        userWhere.companyId = { not: null };
    } else if (hasCompany === "false") {
        userWhere.companyId = null;
    }

    const trimmedSearch = `${search || ""}`.trim();
    if (trimmedSearch) {
        userWhere.OR = [
            { email: { contains: trimmedSearch, mode: "insensitive" } },
            { username: { contains: trimmedSearch, mode: "insensitive" } },
            { company: { name: { contains: trimmedSearch, mode: "insensitive" } } },
        ];
    }
    if (Object.keys(userWhere).length) {
        where.user = userWhere;
    }

    const [total, subscriptions] = await Promise.all([
        prisma.subscription.count({ where }),
        prisma.subscription.findMany({
            where,
            select: {
                userId: true,
                plan: true,
                status: true,
                startedAt: true,
                endsAt: true,
                trialEndsAt: true,
                cancelAtPeriodEnd: true,
                scheduledPlan: true,
                updatedAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        company: { select: { id: true, name: true } },
                    },
                },
            },
            // Most-recently-changed subscription first - surfaces whoever
            // just upgraded/cancelled/renewed instead of an arbitrary order.
            orderBy: { updatedAt: "desc" },
            skip: (pageNum - 1) * pageSizeNum,
            take: pageSizeNum,
        }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            { subscriptions, total, page: pageNum, pageSize: pageSizeNum },
            "Admin subscriptions fetched successfully"
        )
    );
});

/**
 * GET /subscriptions/admin/payments
 *
 * Dedicated payments ledger for the admin panel - existing
 * getUpgradeRequestsAdmin above is really an "upgrade requests I need to
 * review" queue (defaults to open/reviewing only, filters by workflow
 * `status`), not a payments view: it never surfaces paymentStatus,
 * paymentProvider, paymentSessionId, paidAt, or the period covered, and it
 * can't be filtered/searched by any of them. This exposes exactly that,
 * paginated, across every request regardless of workflow status by default.
 */
export const getAdminPayments = asyncHandler(async (req, res) => {
    const { paymentStatus, status, search, page, pageSize, isTestPayment, hasCompany, userId } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    const where = {};
    // Exact match, not part of the fuzzy `search` below - this is what
    // scopes the ledger to "this one user's payment history" for the
    // per-subscriber drill-down in ManageSubscriptionModal.
    if (userId) {
        where.userId = userId;
    }
    if (PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
        where.paymentStatus = paymentStatus;
    }
    if (["open", "reviewing", "approved", "rejected", "closed"].includes(status)) {
        where.status = status;
    }
    // "unknown" filters for the (pre-this-feature) rows we genuinely never
    // recorded a test/live flag for - distinct from explicitly false.
    if (isTestPayment === "true") {
        where.isTestPayment = true;
    } else if (isTestPayment === "false") {
        where.isTestPayment = false;
    } else if (isTestPayment === "unknown") {
        where.isTestPayment = null;
    }

    // "Empresa" account = the user belongs to a Company (see User.companyId) -
    // an independent/individual user has none. Lets the admin filter for
    // exactly the "is this a business" distinction the payments ledger
    // otherwise has no way to surface at all.
    if (hasCompany === "true") {
        where.user = { ...(where.user || {}), companyId: { not: null } };
    } else if (hasCompany === "false") {
        where.user = { ...(where.user || {}), companyId: null };
    }

    const trimmedSearch = `${search || ""}`.trim();
    if (trimmedSearch) {
        where.OR = [
            { id: trimmedSearch },
            { paymentSessionId: { contains: trimmedSearch, mode: "insensitive" } },
            { user: { email: { contains: trimmedSearch, mode: "insensitive" } } },
            { user: { username: { contains: trimmedSearch, mode: "insensitive" } } },
            { user: { company: { name: { contains: trimmedSearch, mode: "insensitive" } } } },
        ];
    }

    const [total, requests] = await Promise.all([
        prisma.planUpgradeRequest.count({ where }),
        prisma.planUpgradeRequest.findMany({
            where,
            select: {
                ...UPGRADE_REQUEST_SELECT,
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        company: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (pageNum - 1) * pageSizeNum,
            take: pageSizeNum,
        }),
    ]);

    // The ledger is a history of individual payment attempts - a user who's
    // upgraded/renewed several times has one row per attempt, and nothing in
    // that list says which one reflects what's actually active right now.
    // Attaching each row's user's CURRENT Subscription (a separate table
    // entirely - see the Subscription model) answers "which of these is the
    // real one" directly in the ledger instead of making the admin go
    // cross-reference by hand.
    const uniqueUserIds = [...new Set(requests.map((r) => r.userId))];
    const subscriptions = uniqueUserIds.length
        ? await prisma.subscription.findMany({
              where: { userId: { in: uniqueUserIds } },
              select: {
                  userId: true,
                  plan: true,
                  status: true,
                  endsAt: true,
                  trialEndsAt: true,
                  cancelAtPeriodEnd: true,
                  scheduledPlan: true,
              },
          })
        : [];
    const subscriptionByUserId = Object.fromEntries(subscriptions.map((s) => [s.userId, s]));
    const enrichedRequests = requests.map((r) => ({
        ...r,
        currentSubscription: subscriptionByUserId[r.userId] || null,
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            { requests: enrichedRequests, total, page: pageNum, pageSize: pageSizeNum },
            "Admin payments fetched successfully"
        )
    );
});

/**
 * POST /subscriptions/admin/upgrade-requests/:id/reverify-payment
 *
 * Lets an admin force a live re-check against the provider for ANY user's
 * stuck "pending" payment, instead of waiting on the 15-min reconcile job
 * or the 48h backstop in resolvePendingPaymentStatus. Deliberately thin:
 * this reuses that exact same trusted function every other self-heal path
 * already goes through (the user's own checkout-status poll, the
 * epayco-verify/verify-activate fallbacks, the periodic reconcile job) -
 * no new trust boundary, no way to activate a plan this function itself
 * doesn't already gate on independently re-verified amount/currency.
 */
export const reverifyAdminPayment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const request = await prisma.planUpgradeRequest.findUnique({
        where: { id },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (request.status !== "approved" || request.paymentStatus !== "pending") {
        return res.status(200).json(
            new ApiResponse(
                200,
                { changed: false, status: request.status, paymentStatus: request.paymentStatus },
                "Nothing to re-verify"
            )
        );
    }

    let resolved;
    try {
        resolved = await resolvePendingPaymentStatus(request);
    } catch (error) {
        console.error("[admin-reverify] Provider verification failed", {
            requestId: id,
            message: error?.message,
        });
        return next(new ApiError(502, "Could not verify against the provider. Please try again shortly."));
    }

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "reverify_payment",
        targetType: "payment",
        targetId: id,
        targetUserId: request.userId,
        metadata: { fromPaymentStatus: request.paymentStatus, toPaymentStatus: resolved.paymentStatus },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                changed: resolved.paymentStatus !== "pending",
                status: resolved.status,
                paymentStatus: resolved.paymentStatus,
            },
            "Re-verification complete"
        )
    );
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
            // The card form (card_token) charges only when submitted - until
            // then no payment is in flight, and "pending" would block retries.
            paymentStatus: checkout.paymentMethod === "card_token" ? "awaiting_checkout" : "pending",
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
        select: { id: true, status: true, paymentStatus: true, targetPlan: true, billingCycle: true },
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
    let paidAmount = null;
    let paidCurrency = null;
    if (provider === "stripe") {
        paidCurrency = `${session?.currency || ""}`.toLowerCase();
        const expectedAmount = getAmountForPlanAndCurrency(
            existingRequest.targetPlan,
            paidCurrency,
            existingRequest.billingCycle
        );
        paidAmount = Math.round(Number(session?.amount_total));
        amountOk =
            expectedAmount !== null &&
            Number.isFinite(paidAmount) &&
            Math.abs(paidAmount - expectedAmount) <= 1;
    }

    // Stripe checkout sessions carry their own livemode flag - true test/live
    // truth for this specific session, not just "whatever key we're
    // currently configured with" (which is all epayco.service.js's env-based
    // `test` config can ever say, since it doesn't vary per-transaction).
    const isTestPayment =
        provider === "stripe" && typeof session?.livemode === "boolean" ? !session.livemode : undefined;

    if (!amountOk) {
        console.error("[payment-webhook] Amount/currency mismatch — refusing to activate", {
            upgradeRequestId,
            targetPlan: existingRequest.targetPlan,
            currency: session?.currency,
            paidAmount: session?.amount_total,
        });
        await prisma.planUpgradeRequest.updateMany({
            where: { id: upgradeRequestId, status: "approved" },
            data: {
                paymentStatus: "amount_mismatch",
                ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}),
            },
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
        isTestPayment,
        paidAmount,
        paidCurrency,
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

        // Card saved for automatic renewal: a paid card checkout created
        // with setup_future_usage, or a "cambiar tarjeta" setup session.
        // Isolated so a failure here never blocks plan activation below.
        if (provider === "stripe" && event?.type === "checkout.session.completed") {
            await saveStripeCardFromCheckoutSession(session).catch((err) =>
                console.error("[payment-webhook] Could not store card for auto-renewal", err?.message)
            );
        }

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

    // Enterprise has no automated checkout amount to fall back on (see
    // shouldRouteToManualReview above), so approving one without a manual
    // payment link would leave the requester on "approved" with nothing to
    // actually pay - the frontend has no automated checkout to offer them.
    // adminResponse is required too: it's the only place the negotiated
    // capacity/price actually gets written down anywhere the requester can
    // see it - a payment link with no adminResponse asks them to pay for
    // terms they were never shown.
    if (statusChanged && status === "approved" && existing.targetPlan === "enterprise") {
        if (!(normalizedPaymentLink || existing.paymentLink)) {
            return next(
                new ApiError(400, "A payment link is required to approve an Enterprise request")
            );
        }
        if (!(adminResponse?.trim() || existing.adminResponse)) {
            return next(
                new ApiError(
                    400,
                    "An admin response describing the agreed plan is required to approve an Enterprise request"
                )
            );
        }
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

        await logAdminAction({
            adminId: req.user.prismaId,
            action: "close_upgrade_request",
            targetType: "upgrade_request",
            targetId: existing.id,
            targetUserId: existing.userId,
            metadata: {
                fromStatus: existing.status,
                toStatus: status,
                paymentStatus: existing.paymentStatus,
                activated: Boolean(closedResult?.activated),
            },
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

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "update_upgrade_request",
        targetType: "upgrade_request",
        targetId: id,
        targetUserId: existing.userId,
        metadata: { fromStatus: existing.status, toStatus: status },
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
 * POST /subscriptions/me/upgrade-requests/:id/epayco-checkout-closed
 *
 * Self-reported "the customer closed the ePayco checkout without
 * finishing" signal, sent by EpaycoCheckout.jsx's onClosed hook (only
 * fires in onpage/embedded checkout mode - see buildEpaycoWidgetParams).
 *
 * This is NOT a source of truth the way the signed confirmation webhook
 * is - it's purely a fast-path so an obviously-abandoned checkout doesn't
 * sit blocking retries for the full 48h PENDING_PAYMENT_TIMEOUT_MS backstop
 * in resolvePendingPaymentStatus. Safe even if the signal is wrong, late,
 * or spoofed by the request's own owner: it can only ever move a request
 * the caller already owns from paymentStatus "pending" to "cancelled" -
 * never "paid" - so it can't grant anything. Worst case is the customer
 * cancels their own still-genuinely-pending payment a little early and has
 * to retry, which is exactly what they were already trying to do.
 */
export const reportEpaycoCheckoutClosed = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: { id: true, status: true, paymentStatus: true },
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    if (request.status !== "approved" || request.paymentStatus !== "pending") {
        // Already resolved by something else (webhook, a poll's self-heal,
        // or this exact signal already firing once) - nothing to do, and
        // definitely not worth surfacing as an error to the customer.
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Nothing to update"));
    }

    await markUpgradeRequestPaymentFailed({ upgradeRequestId: id, paymentStatus: "cancelled" });

    return res.status(200).json(new ApiResponse(200, { updated: true }, "Checkout marked as cancelled"));
});

/**
 * POST /subscriptions/me/upgrade-requests/:id/epayco-reference
 *
 * Self-reported "here's the real ref_payco ePayco gave the browser" signal,
 * sent from EpaycoResponseRedirect.jsx (the response-URL redirect, which
 * ePayco's own docs confirm includes `ref_payco` in the query string) and
 * from EpaycoCheckout.jsx's onResponse hook.
 *
 * Why this exists: paymentSessionId starts as our own internal placeholder
 * (see generateEpaycoReference) and, before this endpoint, only ever got
 * overwritten with the REAL ref_payco by the signed confirmation webhook.
 * That webhook hits this backend on Render, which spins down when idle -
 * if ePayco's webhook call lands during a cold start and ePayco doesn't
 * retry (undocumented - could not confirm either way), that payment's real
 * reference is lost forever: resolvePendingPaymentStatus's live-query
 * fallback can't query a placeholder, so a genuinely-paid customer could
 * sit "pending" until the 48h ceiling silently mislabels it "expired" -
 * actively wrong if money really was taken. This gives that live-query
 * fallback a second, independent way to learn the real reference.
 *
 * Trust model - this is NOT a trusted source of truth the way the signed
 * webhook is (the browser/client controls what refPayco value gets sent
 * here), so it is deliberately restricted to doing only one thing: filling
 * in paymentSessionId so the EXISTING trusted verification pipeline
 * (resolvePendingPaymentStatus, called on every poll and every 15-min
 * reconcile cycle) has something real to query. It never itself activates,
 * marks paid, or marks failed - resolvePendingPaymentStatus still
 * independently re-verifies state/amount/currency against ePayco's own
 * authenticated API before doing any of that.
 *
 * Two guards close the gap a forged refPayco could otherwise open (a client
 * choosing an arbitrary REAL approved transaction of the right amount to
 * try to activate a plan for free):
 *  1. Only fills in paymentSessionId while it's still literally our own
 *     untouched placeholder ("OHNIX-<requestId>-...") - never overwrites a
 *     value the trusted webhook already wrote.
 *  2. Refuses a refPayco that's already the paymentSessionId of a
 *     DIFFERENT closed+paid request - a real payment can only ever unlock
 *     the one upgrade it was actually made for, not be replayed across
 *     several.
 */
export const reportEpaycoTransactionReference = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const refPayco = `${req.body?.refPayco || ""}`.trim();

    if (!refPayco) {
        return res.status(200).json(new ApiResponse(200, { updated: false }, "No reference provided"));
    }

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id, userId: req.user.prismaId },
        select: { id: true, status: true, paymentStatus: true, paymentProvider: true, paymentSessionId: true },
    });

    if (!request) {
        return next(new ApiError(404, "Upgrade request not found"));
    }

    const isEpaycoRequest = `${request.paymentProvider || ""}`.toLowerCase().includes("epayco");
    const stillUntouchedPlaceholder = `${request.paymentSessionId || ""}`.startsWith(`OHNIX-${id}-`);

    if (
        !isEpaycoRequest ||
        request.status !== "approved" ||
        request.paymentStatus !== "pending" ||
        !stillUntouchedPlaceholder
    ) {
        // Already resolved, not ePayco, or paymentSessionId already holds a
        // real reference (from the trusted webhook, or a prior call here) -
        // nothing safe to do, and definitely not worth erroring over.
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Nothing to update"));
    }

    const alreadyConsumedBy = await prisma.planUpgradeRequest.findFirst({
        where: {
            paymentSessionId: refPayco,
            status: "closed",
            paymentStatus: "paid",
            NOT: { id },
        },
        select: { id: true },
    });

    if (alreadyConsumedBy) {
        console.warn("[epayco-reference] Rejected reused ref_payco", { requestId: id, refPayco });
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Reference already in use"));
    }

    await prisma.planUpgradeRequest.updateMany({
        where: {
            id,
            status: "approved",
            paymentStatus: "pending",
            paymentSessionId: request.paymentSessionId,
        },
        data: { paymentSessionId: refPayco },
    });

    return res.status(200).json(new ApiResponse(200, { updated: true }, "Reference recorded"));
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

    // Create auto-approved renewal request (currentPlan === targetPlan signals
    // renewal). billingCycle is inherited from the account's *standing*
    // cycle (Subscription.billingCycle), never defaulted to MONTHLY here -
    // otherwise an annual customer's first auto-renewal would silently
    // re-bill them monthly instead of continuing their "paga 10, lleva 12"
    // plan.
    const renewalBillingCycle = normalizeBillingCycle(subscription.billingCycle);
    const request = await prisma.planUpgradeRequest.create({
        data: {
            userId: req.user.prismaId,
            currentPlan: subscription.plan,
            targetPlan: subscription.plan,
            billingCycle: renewalBillingCycle,
            status: "approved",
            adminResponse:
                renewalBillingCycle === "ANNUAL"
                    ? "Renovación automática. Completa el pago para extender tu plan 365 días."
                    : "Renovación automática. Completa el pago para extender tu plan 30 días.",
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
            // The card form (card_token) charges only when submitted - until
            // then no payment is in flight, and "pending" would block retries.
            paymentStatus: checkout.paymentMethod === "card_token" ? "awaiting_checkout" : "pending",
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
        const responseText = `${data.x_response || ""}`.trim();
        const requestId = `${data.x_extra1 || ""}`.trim(); // set as p_extra1 during checkout
        const isTestPayment = parseEpaycoTestFlag(data.x_test_request);

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
            select: { id: true, status: true, paymentSessionId: true, paymentStatus: true, targetPlan: true, billingCycle: true },
        });

        if (!existingRequest) {
            console.warn("[epayco-confirmation] Request not found:", requestId);
            return res.status(200).json({ success: false, message: "Request not found" });
        }

        // Idempotency guard: do not process the same successful payment twice
        if (existingRequest.status === "closed" && existingRequest.paymentStatus === "paid") {
            return res.status(200).json({ success: true, message: "Already processed" });
        }

        // Persist ePayco's own transaction reference as soon as we see it,
        // regardless of the transaction's outcome. Until now this only got
        // written on acceptance (inside closeApprovedRequestAndActivatePlan
        // below) - every other outcome left paymentSessionId at whatever
        // checkout-time invoice placeholder was set when the session was
        // created (see payment.service.js), which is NOT a valid ref_payco.
        // queryEpaycoTransaction (the reconcile job's / "verify now"'s live
        // lookup) needs the real ref_payco to find the transaction at all -
        // confirmed against a real stuck production request, where querying
        // by the stored placeholder returned "Transacción no existe" even
        // once the query endpoint itself was fixed. Without this, the live
        // lookup can never work for a request whose webhook hasn't already
        // fully resolved it, for any outcome (rejected/failed/expired/
        // cancelled), not just the "Cancelada" case that surfaced this.
        if (refPayco && existingRequest.paymentSessionId !== refPayco) {
            await prisma.planUpgradeRequest.updateMany({
                where: { id: requestId, status: "approved" },
                data: { paymentSessionId: refPayco },
            });
        }

        if (isEpaycoTransactionApproved(stateCode)) {
            // The signature only proves the payload wasn't tampered with in
            // transit - it says nothing about whether the amount actually
            // paid matches what this plan costs. Without this check, a
            // manipulated `amount` sent to ePayco's widget in the browser
            // (see EpaycoCheckout.jsx) would still produce a validly-signed
            // confirmation for whatever lower amount was actually charged.
            const expectedAmount = getEpaycoAmount(existingRequest.targetPlan, existingRequest.billingCycle);
            const paidAmount = Math.round(Number(amount));
            const amountMatches = expectedAmount !== null && Math.abs(paidAmount - expectedAmount) <= 1;
            const currencyMatches = currencyCode.toUpperCase() === "COP";

            if (!amountMatches || !currencyMatches) {
                console.error("[epayco-confirmation] Amount/currency mismatch — refusing to activate", {
                    requestId, targetPlan: existingRequest.targetPlan, expectedAmount, paidAmount, currencyCode,
                });
                await prisma.planUpgradeRequest.updateMany({
                    where: { id: requestId, status: "approved" },
                    data: {
                        paymentStatus: "amount_mismatch",
                        ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}),
                    },
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
                isTestPayment,
                paidAmount,
                paidCurrency: "cop",
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
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus, isTestPayment });
        } else if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) {
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus: "expired", isTestPayment });
        } else if (stateCode === EPAYCO_STATE.CANCELLED) {
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus: "cancelled", isTestPayment });
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
            // Any other code - notably ePayco's "Cancelada" state (the
            // customer backed out of checkout), which isn't covered by the
            // documented codes above - is terminal from the customer's
            // perspective: they won't come back and complete this specific
            // attempt. Resolving it now instead of silently ignoring it
            // frees them to retry immediately instead of sitting blocked
            // behind the "a payment is already in progress" guard for up to
            // the 48h staleness ceiling.
            const paymentStatus = isEpaycoCancelledResponse(responseText) ? "cancelled" : "failed";
            console.warn(
                `[epayco-confirmation] Unrecognized transaction state ${stateCode} ("${responseText}") for requestId ${requestId} — treating as terminal (${paymentStatus})`
            );
            await markUpgradeRequestPaymentFailed({ upgradeRequestId: requestId, paymentStatus, isTestPayment });
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

    const frontendBase = `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");

    if (!requestId) {
        return res.redirect(`${frontendBase}/billing`);
    }

    // Every outcome (accepted, rejected, abandoned, whatever) goes to the
    // same success page - no need to branch on x_cod_transaction_state here
    // at all. Its own poll re-checks paymentStatus on every cycle and
    // renders the matching card (celebration or rejected+retry) itself.
    // Splitting failures off to a bare `/billing?payment=cancelled` toast
    // used to be necessary only because this page's pending state used to
    // misleadingly say "Pago recibido" for a rejection too; now that it
    // doesn't, one continuous loading -> result page is both simpler and
    // the cleaner redirect a payment result deserves.
    return res.redirect(
        `${frontendBase}/billing/payment-success?requestId=${encodeURIComponent(requestId)}`
    );
};

// =============================================================================
// Stored card / automatic renewal (subscriptionAutoRenew.service.js)
// =============================================================================

const getClientIp = (req) =>
    `${req.headers["x-forwarded-for"] || ""}`.split(",")[0].trim() || req.ip || undefined;

/**
 * GET /subscriptions/me/upgrade-requests/:id/card-checkout
 * What CardCheckout.jsx needs: the amount/plan being paid plus ePayco's
 * PUBLIC tokenization config (never a secret).
 */
export const getCardCheckoutParams = asyncHandler(async (req, res, next) => {
    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id: req.params.id, userId: req.user.prismaId },
        select: UPGRADE_REQUEST_SELECT,
    });
    if (!request) return next(new ApiError(404, "Upgrade request not found"));
    if (request.status !== "approved") {
        return next(new ApiError(409, "Esta solicitud ya no admite pagos."));
    }
    if (!isEpaycoConfigured()) return next(new ApiError(503, "ePayco is not configured."));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                requestId: request.id,
                currentPlan: request.currentPlan,
                targetPlan: request.targetPlan,
                billingCycle: request.billingCycle,
                isRenewal: request.currentPlan === request.targetPlan,
                amount: getEpaycoAmount(request.targetPlan, request.billingCycle),
                currency: "COP",
                paymentStatus: request.paymentStatus,
                docTypes: SUPPORTED_DOC_TYPES,
                ...getEpaycoPublicTokenizationConfig(),
            },
            "Card checkout params"
        )
    );
});

/**
 * POST /subscriptions/me/upgrade-requests/:id/card-pay
 * Body: { tokenCard, docType, docNumber, holderName, cardMeta: { brand, last4, expMonth, expYear } }
 */
export const payMyRequestWithCard = asyncHandler(async (req, res) => {
    const { tokenCard, docType, docNumber, holderName, cardMeta } = req.body || {};
    const result = await payRequestWithNewCard({
        userId: req.user.prismaId,
        requestId: req.params.id,
        tokenCard,
        docType,
        docNumber,
        holderName,
        cardMeta,
        ip: getClientIp(req),
    });
    return res
        .status(200)
        .json(new ApiResponse(200, result, result.status === "paid" ? "Pago aprobado" : "Pago en verificación"));
});

/** GET /subscriptions/me/payment-method */
export const getMyPaymentMethod = asyncHandler(async (req, res) => {
    await ensureUserSubscription(req.user.prismaId);
    const info = await getPaymentMethodInfo(req.user.prismaId);
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...info,
                canUseEpaycoCard: isEpaycoConfigured(),
                epayco: isEpaycoConfigured() ? getEpaycoPublicTokenizationConfig() : null,
                docTypes: SUPPORTED_DOC_TYPES,
            },
            "Payment method fetched"
        )
    );
});

/**
 * PUT /subscriptions/me/payment-method
 * ePayco: { provider: "epayco", tokenCard, docType, docNumber, holderName, cardMeta }
 * Stripe: { provider: "stripe" } -> returns { checkoutUrl } of a setup session.
 */
export const updateMyPaymentMethod = asyncHandler(async (req, res, next) => {
    const { provider, tokenCard, docType, docNumber, holderName, cardMeta } = req.body || {};

    if (provider === "stripe") {
        const user = await prisma.user.findUnique({
            where: { id: req.user.prismaId },
            select: { id: true, email: true, username: true },
        });
        try {
            const setup = await createStripeSetupSession({ user });
            return res.status(200).json(new ApiResponse(200, setup, "Setup session created"));
        } catch (error) {
            return next(new ApiError(502, error?.message || "No se pudo iniciar el cambio de tarjeta."));
        }
    }

    const result = await replaceEpaycoCard({
        userId: req.user.prismaId,
        tokenCard,
        docType,
        docNumber,
        holderName,
        cardMeta,
    });
    return res.status(200).json(new ApiResponse(200, result, "Tarjeta actualizada"));
});

/** PATCH /subscriptions/me/auto-renew  Body: { enabled: boolean } */
export const setMyAutoRenew = asyncHandler(async (req, res, next) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") return next(new ApiError(400, "enabled must be a boolean"));
    await ensureUserSubscription(req.user.prismaId);
    await setAutoRenew({ userId: req.user.prismaId, enabled });
    const info = await getPaymentMethodInfo(req.user.prismaId);
    return res.status(200).json(
        new ApiResponse(
            200,
            info,
            enabled ? "Renovación automática activada" : "Renovación automática desactivada"
        )
    );
});

/** DELETE /subscriptions/me/payment-method */
export const deleteMyPaymentMethod = asyncHandler(async (req, res) => {
    await deleteStoredCard({ userId: req.user.prismaId });
    const info = await getPaymentMethodInfo(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, info, "Tarjeta eliminada"));
});
