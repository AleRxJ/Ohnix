// Backend/services/subscriptionAutoRenew.service.js
//
// Automatic renewal of Ohnix's own SaaS plans against a stored card.
//
// How a card gets stored:
//  - Colombia: the customer pays through Ohnix's own card form
//    (CardCheckout.jsx) - ePayco's JS tokenizes the card in the browser,
//    payRequestWithNewCard below creates an ePayco customer, charges the
//    first payment and stores the token.
//  - Stripe (Europe / rest of world): card checkouts are created with
//    setup_future_usage=off_session (payment.service.js), and the webhook
//    calls saveStripeCardFromCheckoutSession once the payment completes.
//
// Paying with a card IS the recurring-charge authorization (same model as
// Netflix/LinkedIn): the consent text sits next to the pay button and
// autoRenewConsentAt records when it was accepted. The customer can turn
// automatic renewal off at any time (the plan then just ends at endsAt);
// the card can only be REPLACED while automatic renewal is on, and only
// deleted once it's off.
//
// Renewal: subscriptionRenewalScheduler calls runDueAutoRenewals daily.
// The first attempt fires up to 24h before endsAt (so a successful charge
// extends from endsAt with no gap); failures are retried per
// RETRY_SCHEDULE_DAYS. The existing 5-day grace period / pause in
// blockLapsedSubscriptions is untouched - a retry that succeeds after the
// pause reactivates the account on its own (closeApprovedRequestAndActivatePlan
// sets status "active").

import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    chargeEpaycoToken,
    createEpaycoCustomer,
} from "./epaycoRecurringBilling.service.js";
import {
    getEpaycoAmount,
    getEpaycoConfirmationUrl,
} from "./epayco.service.js";
import {
    chargeStripeOffSession,
    getAmountForPlanAndCurrency,
    getPaymentMethodFromCheckoutSession,
    getStripePaymentMethodSummary,
} from "./payment.service.js";
import {
    closeApprovedRequestAndActivatePlan,
    UPGRADE_REQUEST_SELECT,
} from "../controllers/subscription.controller.js";
import {
    notifyAutoChargeFailed,
    notifyAutoChargeRetriesExhausted,
    notifyAutoChargeSucceeded,
    notifyCardExpiringSoon,
    notifyUpcomingAutoCharge,
} from "../utils/autoRenewNotifications.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// The first charge attempt happens this long before endsAt.
const FIRST_ATTEMPT_LEAD_MS = DAY_MS;
// Retries, in days after endsAt, for attempt #2, #3... The grace period in
// subscriptionRenewalScheduler pauses the account at +5; the later retries
// keep trying (and reactivate on success) until +30, then give up.
export const RETRY_SCHEDULE_DAYS = [1, 3, 5, 10, 20, 30];
const GRACE_PERIOD_DAYS = 5;
// How long a claimed subscription stays locked against a second concurrent
// charge attempt (scheduler overlap, multiple instances, restarts).
const CLAIM_LOCK_MS = 2 * 60 * 60 * 1000;

export const SUPPORTED_DOC_TYPES = ["CC", "CE", "NIT", "PPN", "TI"];

const hasStoredCard = (sub) =>
    Boolean(
        (sub?.paymentProvider === "epayco" && sub.epaycoTokenCard && sub.epaycoCustomerId) ||
            (sub?.paymentProvider === "stripe" && sub.stripeCustomerId && sub.stripePaymentMethodId)
    );

const USER_SELECT = { id: true, email: true, username: true, preferredLanguage: true };

// Plan the next renewal bills for: a scheduled self-service downgrade takes
// effect at renewal, otherwise the current plan.
const getRenewalPlan = (sub) => sub.scheduledPlan || sub.plan;

// Stripe charges renew in whatever currency the customer last paid in
// (EUR/USD/COP); ePayco is always COP.
const getStripeRenewalCurrency = async (userId) => {
    const lastPaid = await prisma.planUpgradeRequest.findFirst({
        where: {
            userId,
            paymentStatus: "paid",
            paymentProvider: { startsWith: "stripe" },
            paidCurrency: { not: null },
        },
        orderBy: { paidAt: "desc" },
        select: { paidCurrency: true },
    });
    return `${lastPaid?.paidCurrency || "usd"}`.toLowerCase();
};

export const getRenewalCharge = async (sub) => {
    const plan = getRenewalPlan(sub);
    if (sub.paymentProvider === "epayco") {
        return { plan, amount: getEpaycoAmount(plan, sub.billingCycle), currency: "cop" };
    }
    const currency = await getStripeRenewalCurrency(sub.userId);
    return { plan, amount: getAmountForPlanAndCurrency(plan, currency, sub.billingCycle), currency };
};

const toDateKey = (date) => new Date(date).toISOString().slice(0, 10).replace(/-/g, "");

const computeNextAttemptAt = (endsAt, attemptsSoFar) => {
    const offsetDays = RETRY_SCHEDULE_DAYS[attemptsSoFar - 1];
    if (offsetDays === undefined) return null; // retries exhausted
    const next = new Date(new Date(endsAt).getTime() + offsetDays * DAY_MS);
    // Never schedule in the past (e.g. an attempt that itself ran late).
    return next.getTime() > Date.now() ? next : new Date(Date.now() + DAY_MS);
};

// Closes any manual renewal checkout the customer opened but never paid,
// once an automatic charge already renewed the plan - otherwise paying
// that stale checkout later would buy a second period by accident.
const closeStaleManualRenewals = async (userId, keepRequestId) => {
    const stale = await prisma.planUpgradeRequest.findMany({
        where: {
            userId,
            id: { not: keepRequestId },
            status: "approved",
            isAutoCharge: false,
            paymentStatus: { in: ["awaiting_checkout", "rejected", "failed", "expired", "cancelled"] },
        },
        select: { id: true, currentPlan: true, targetPlan: true },
    });
    const renewalIds = stale.filter((r) => r.currentPlan === r.targetPlan).map((r) => r.id);
    if (renewalIds.length) {
        await prisma.planUpgradeRequest.updateMany({
            where: { id: { in: renewalIds }, status: "approved" },
            data: { status: "closed", paymentStatus: "cancelled" },
        });
    }
};

// ─── Card storage ────────────────────────────────────────────────────────────

const saveCardOnSubscription = (userId, data) =>
    prisma.subscription.update({
        where: { userId },
        data: {
            ...data,
            autoRenew: true,
            autoRenewConsentAt: new Date(),
            renewalAttempts: 0,
            nextRenewalAttemptAt: null,
            lastRenewalError: null,
        },
    });

const normalizeCardMeta = (cardMeta = {}) => {
    const last4 = `${cardMeta.last4 || ""}`.replace(/\D/g, "").slice(-4) || null;
    const expMonth = Number(cardMeta.expMonth);
    const expYearRaw = Number(cardMeta.expYear);
    const expYear = Number.isFinite(expYearRaw) && expYearRaw > 0 && expYearRaw < 100 ? 2000 + expYearRaw : expYearRaw;
    return {
        cardBrand: `${cardMeta.brand || ""}`.trim().slice(0, 30) || null,
        cardLast4: last4,
        cardExpMonth: Number.isInteger(expMonth) && expMonth >= 1 && expMonth <= 12 ? expMonth : null,
        cardExpYear: Number.isInteger(expYear) && expYear >= 2000 ? expYear : null,
    };
};

const validateCardholder = ({ tokenCard, docType, docNumber, holderName }) => {
    if (!tokenCard) throw new ApiError(400, "tokenCard is required");
    if (!SUPPORTED_DOC_TYPES.includes(docType)) throw new ApiError(400, "Tipo de documento no válido.");
    if (!`${docNumber || ""}`.trim()) throw new ApiError(400, "El número de documento es obligatorio.");
    if (!`${holderName || ""}`.trim()) throw new ApiError(400, "El nombre del titular es obligatorio.");
};

const splitHolderName = (holderName) => {
    const parts = `${holderName}`.trim().split(/\s+/);
    if (parts.length === 1) return { name: parts[0], lastName: parts[0] };
    return { name: parts.slice(0, Math.ceil(parts.length / 2)).join(" "), lastName: parts.slice(Math.ceil(parts.length / 2)).join(" ") };
};

// Card form checkout (Colombia): charges the first payment for an approved
// PlanUpgradeRequest (upgrade or manual renewal) with a freshly tokenized
// card, activates the plan, and stores the card for automatic renewal.
export const payRequestWithNewCard = async ({ userId, requestId, tokenCard, docType, docNumber, holderName, cardMeta, ip }) => {
    validateCardholder({ tokenCard, docType, docNumber, holderName });

    const request = await prisma.planUpgradeRequest.findFirst({
        where: { id: requestId, userId },
        select: UPGRADE_REQUEST_SELECT,
    });
    if (!request) throw new ApiError(404, "Upgrade request not found");
    if (request.status !== "approved") throw new ApiError(409, "Esta solicitud ya no admite pagos.");
    if (request.paymentStatus === "pending") {
        throw new ApiError(409, "Ya hay un pago en verificación para esta solicitud.");
    }

    const amount = getEpaycoAmount(request.targetPlan, request.billingCycle);
    if (!amount) throw new ApiError(503, "El precio de este plan no está configurado.");

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    const { name, lastName } = splitHolderName(holderName);

    let customerId;
    try {
        customerId = await createEpaycoCustomer({ tokenCard, name, lastName, email: user?.email });
    } catch (error) {
        console.error("[auto-renew] ePayco customer creation failed", error?.message);
        throw new ApiError(502, "No pudimos registrar la tarjeta. Verifica los datos e inténtalo de nuevo.");
    }

    // Claim the request so a double-submit can't charge twice.
    const claim = await prisma.planUpgradeRequest.updateMany({
        where: { id: request.id, status: "approved", paymentStatus: { not: "pending" } },
        data: { paymentStatus: "pending", paymentProvider: "epayco:card_token:CO" },
    });
    if (claim.count === 0) throw new ApiError(409, "Ya hay un pago en verificación para esta solicitud.");

    const result = await chargeEpaycoToken({
        customerId,
        tokenCard,
        docType,
        docNumber: `${docNumber}`.trim(),
        name,
        lastName,
        email: user?.email,
        value: amount,
        bill: request.paymentSessionId || `OHNIX-${request.id}-${Date.now()}`,
        description: `Ohnix ${request.targetPlan}${request.billingCycle === "ANNUAL" ? " (anual)" : ""}`,
        ip,
        urlConfirmation: getEpaycoConfirmationUrl(),
        extras: { extra1: request.id, extra2: userId, extra3: request.targetPlan },
    });

    if (result.state === "approved" || result.state === "pending") {
        await saveCardOnSubscription(userId, {
            paymentProvider: "epayco",
            epaycoCustomerId: customerId,
            epaycoTokenCard: tokenCard,
            billingDocType: docType,
            billingDocNumber: `${docNumber}`.trim(),
            billingHolderName: `${holderName}`.trim(),
            ...normalizeCardMeta(cardMeta),
        });
    }

    if (result.state === "approved") {
        if (result.amount != null && Math.abs(result.amount - amount) > 1) {
            console.error("[auto-renew] ePayco card charge amount mismatch", { requestId, expected: amount, got: result.amount });
            await prisma.planUpgradeRequest.update({
                where: { id: request.id },
                data: { paymentStatus: "amount_mismatch", paymentSessionId: result.ref || undefined },
            });
            throw new ApiError(502, "El monto cobrado no coincide. Contacta a soporte.");
        }
        await closeApprovedRequestAndActivatePlan({
            requestId: request.id,
            actedBy: "card-checkout",
            paymentSessionId: result.ref || request.paymentSessionId,
            paymentProvider: "epayco",
            paymentStatus: "paid",
            isTestPayment: typeof result.isTest === "boolean" ? result.isTest : undefined,
            paidAmount: amount,
            paidCurrency: "cop",
        });
        return { status: "paid", requestId: request.id };
    }

    if (result.state === "pending") {
        // Settled later by handleEpaycoConfirmation (extra1 = request id) or
        // the reconcile job, which queries by this ref_payco.
        if (result.ref) {
            await prisma.planUpgradeRequest.update({ where: { id: request.id }, data: { paymentSessionId: result.ref } });
        }
        return { status: "pending", requestId: request.id };
    }

    await prisma.planUpgradeRequest.update({
        where: { id: request.id },
        data: { paymentStatus: result.state === "rejected" ? "rejected" : "failed" },
    });
    throw new ApiError(
        402,
        result.state === "rejected"
            ? "Tu banco rechazó el pago. Prueba con otra tarjeta."
            : result.message || "No se pudo procesar el pago. Inténtalo de nuevo."
    );
};

// "Cambiar tarjeta" (ePayco). ePayco has no zero-amount verification, so
// the new card is validated by a real charge only when one is due right
// now (account past due / paused); otherwise at the next renewal.
export const replaceEpaycoCard = async ({ userId, tokenCard, docType, docNumber, holderName, cardMeta }) => {
    validateCardholder({ tokenCard, docType, docNumber, holderName });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    const { name, lastName } = splitHolderName(holderName);

    let customerId;
    try {
        customerId = await createEpaycoCustomer({ tokenCard, name, lastName, email: user?.email });
    } catch (error) {
        console.error("[auto-renew] ePayco customer creation failed", error?.message);
        throw new ApiError(502, "No pudimos registrar la tarjeta. Verifica los datos e inténtalo de nuevo.");
    }

    const sub = await saveCardOnSubscription(userId, {
        paymentProvider: "epayco",
        epaycoCustomerId: customerId,
        epaycoTokenCard: tokenCard,
        billingDocType: docType,
        billingDocNumber: `${docNumber}`.trim(),
        billingHolderName: `${holderName}`.trim(),
        ...normalizeCardMeta(cardMeta),
    });

    return chargeNowIfPastDue(sub);
};

// Stripe webhook: a checkout.session.completed either paid a plan with
// setup_future_usage (payment mode) or replaced the card (setup mode).
export const saveStripeCardFromCheckoutSession = async (session) => {
    const isSetup = session?.mode === "setup";
    const wantsSave = isSetup || session?.metadata?.saveCardForAutoRenew === "true";
    const customerId = typeof session?.customer === "string" ? session.customer : session?.customer?.id;
    if (!wantsSave || !customerId) return null;
    if (!isSetup && session.payment_status !== "paid") return null;

    const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
    if (!sub) return null;

    const paymentMethodId = await getPaymentMethodFromCheckoutSession(session);
    if (!paymentMethodId) return null;
    const pm = await getStripePaymentMethodSummary(paymentMethodId);

    const updated = await saveCardOnSubscription(sub.userId, {
        paymentProvider: "stripe",
        stripePaymentMethodId: paymentMethodId,
        cardBrand: pm?.brand || null,
        cardLast4: pm?.last4 || null,
        cardExpMonth: pm?.expMonth || null,
        cardExpYear: pm?.expYear || null,
    });

    return isSetup ? chargeNowIfPastDue(updated) : { saved: true };
};

const chargeNowIfPastDue = async (sub) => {
    const pastDue = sub.endsAt && new Date(sub.endsAt).getTime() <= Date.now() + FIRST_ATTEMPT_LEAD_MS;
    if (!pastDue || sub.cancelAtPeriodEnd) return { saved: true, charged: false };
    const outcome = await chargeSubscriptionRenewal(sub.id, { force: true });
    return { saved: true, charged: true, outcome };
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const setAutoRenew = async ({ userId, enabled }) => {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw new ApiError(404, "Subscription not found");
    if (enabled && !hasStoredCard(sub)) {
        throw new ApiError(400, "Agrega una tarjeta para activar la renovación automática.");
    }
    return prisma.subscription.update({
        where: { userId },
        data: enabled
            ? { autoRenew: true, autoRenewConsentAt: new Date(), cancelAtPeriodEnd: false, renewalAttempts: 0, nextRenewalAttemptAt: null }
            : { autoRenew: false, nextRenewalAttemptAt: null },
    });
};

// Only allowed once automatic renewal is off - an active auto-renewing plan
// can have its card replaced, never removed.
export const deleteStoredCard = async ({ userId }) => {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw new ApiError(404, "Subscription not found");
    if (sub.autoRenew) {
        throw new ApiError(409, "Desactiva la renovación automática antes de eliminar la tarjeta, o reemplázala por otra.");
    }
    return prisma.subscription.update({
        where: { userId },
        data: {
            paymentProvider: null,
            epaycoCustomerId: null,
            epaycoTokenCard: null,
            stripePaymentMethodId: null,
            cardBrand: null,
            cardLast4: null,
            cardExpMonth: null,
            cardExpYear: null,
            renewalAttempts: 0,
            nextRenewalAttemptAt: null,
            lastRenewalError: null,
        },
    });
};

export const getPaymentMethodInfo = async (userId) => {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return null;
    const card = hasStoredCard(sub)
        ? {
              provider: sub.paymentProvider,
              brand: sub.cardBrand,
              last4: sub.cardLast4,
              expMonth: sub.cardExpMonth,
              expYear: sub.cardExpYear,
              holderName: sub.billingHolderName,
          }
        : null;

    let nextCharge = null;
    if (card && sub.autoRenew && !sub.cancelAtPeriodEnd && sub.endsAt) {
        const charge = await getRenewalCharge(sub);
        nextCharge = {
            date: sub.nextRenewalAttemptAt && sub.renewalAttempts > 0 ? sub.nextRenewalAttemptAt : sub.endsAt,
            amount: charge.amount,
            currency: charge.currency,
            plan: charge.plan,
        };
    }

    return {
        card,
        autoRenew: sub.autoRenew,
        autoRenewConsentAt: sub.autoRenewConsentAt,
        nextCharge,
        failedAttempts: sub.renewalAttempts,
        lastError: sub.renewalAttempts > 0 ? sub.lastRenewalError : null,
        nextAttemptAt: sub.renewalAttempts > 0 ? sub.nextRenewalAttemptAt : null,
    };
};

// ─── Charging ────────────────────────────────────────────────────────────────

export const chargeSubscriptionRenewal = async (subscriptionId, { force = false } = {}) => {
    const now = new Date();

    // Atomic claim: only one caller can move nextRenewalAttemptAt forward.
    const claim = await prisma.subscription.updateMany({
        where: {
            id: subscriptionId,
            autoRenew: true,
            cancelAtPeriodEnd: false,
            ...(force ? {} : { OR: [{ nextRenewalAttemptAt: null }, { nextRenewalAttemptAt: { lte: now } }] }),
        },
        data: { nextRenewalAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS) },
    });
    if (claim.count === 0) return { status: "skipped", reason: "not_claimable" };

    const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub?.endsAt || !hasStoredCard(sub)) {
        await prisma.subscription.update({ where: { id: subscriptionId }, data: { nextRenewalAttemptAt: null } });
        return { status: "skipped", reason: "no_card" };
    }

    // A payment already in flight (auto-charge still "Pendiente", or the
    // customer paying manually right now) - don't stack a second charge.
    const inFlight = await prisma.planUpgradeRequest.findFirst({
        where: { userId: sub.userId, status: "approved", paymentStatus: "pending" },
        select: { id: true },
    });
    if (inFlight) {
        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { nextRenewalAttemptAt: new Date(now.getTime() + DAY_MS) },
        });
        return { status: "skipped", reason: "payment_in_flight" };
    }

    const user = await prisma.user.findUnique({ where: { id: sub.userId }, select: USER_SELECT });
    const { plan, amount, currency } = await getRenewalCharge(sub);
    if (!amount) {
        console.error("[auto-renew] No price configured", { subscriptionId, plan, currency });
        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { nextRenewalAttemptAt: new Date(now.getTime() + DAY_MS), lastRenewalError: "price_not_configured" },
        });
        return { status: "skipped", reason: "price_not_configured" };
    }

    const attemptNumber = sub.renewalAttempts + 1;
    // Unique per attempt (the time suffix covers a "Pendiente" charge that
    // later failed without counting as an attempt). Double-charging is
    // prevented by the claim lock + in-flight check above, not by this key.
    const reference = `OHNIX-RENEW-${sub.id}-${toDateKey(sub.endsAt)}-${attemptNumber}-${now.getTime().toString(36)}`;
    const isDowngrade = Boolean(sub.scheduledPlan);
    const providerTag = `${sub.paymentProvider}:auto_charge:${sub.paymentProvider === "epayco" ? "CO" : "INTL"}`;

    // currentPlan === targetPlan marks a renewal, so closeApprovedRequestAndActivatePlan
    // extends from the current endsAt (no lost days) - also for a scheduled
    // downgrade, which is applied here as "renew on the lower plan".
    let request;
    try {
        request = await prisma.planUpgradeRequest.create({
            data: {
                userId: sub.userId,
                currentPlan: plan,
                targetPlan: plan,
                billingCycle: sub.billingCycle,
                status: "approved",
                paymentStatus: "pending",
                paymentProvider: providerTag,
                paymentSessionId: reference,
                isAutoCharge: true,
                notes: isDowngrade ? `Renovación automática con cambio programado de ${sub.plan} a ${plan}.` : "Renovación automática.",
            },
            select: { id: true },
        });
    } catch (error) {
        console.error("[auto-renew] Could not create the charge request", { reference, message: error?.message });
        return { status: "skipped", reason: "request_create_failed" };
    }

    const result =
        sub.paymentProvider === "epayco"
            ? await chargeEpaycoToken({
                  customerId: sub.epaycoCustomerId,
                  tokenCard: sub.epaycoTokenCard,
                  docType: sub.billingDocType || "CC",
                  docNumber: sub.billingDocNumber,
                  ...splitHolderName(sub.billingHolderName || user?.username || "Cliente Ohnix"),
                  email: user?.email,
                  value: amount,
                  bill: reference,
                  description: `Renovación Ohnix ${plan}${sub.billingCycle === "ANNUAL" ? " (anual)" : ""}`,
                  urlConfirmation: getEpaycoConfirmationUrl(),
                  extras: { extra1: request.id, extra2: sub.userId, extra3: plan },
              })
            : await chargeStripeOffSession({
                  customerId: sub.stripeCustomerId,
                  paymentMethodId: sub.stripePaymentMethodId,
                  amount,
                  currency,
                  description: `Ohnix ${plan} renewal`,
                  metadata: { upgradeRequestId: request.id, userId: sub.userId, autoRenew: "true" },
                  idempotencyKey: reference,
              });

    if (result.state === "approved") {
        const wasPaused = sub.status === "paused";
        if (result.ref) {
            await prisma.planUpgradeRequest.update({ where: { id: request.id }, data: { paymentSessionId: result.ref } }).catch(() => {});
        }
        await closeApprovedRequestAndActivatePlan({
            requestId: request.id,
            actedBy: "auto-renew",
            paymentSessionId: result.ref || reference,
            paymentProvider: sub.paymentProvider,
            paymentStatus: "paid",
            isTestPayment: typeof result.isTest === "boolean" ? result.isTest : undefined,
            paidAmount: amount,
            paidCurrency: currency,
            notify: false,
        });
        const renewed = await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                renewalAttempts: 0,
                nextRenewalAttemptAt: null,
                lastRenewalError: null,
                ...(isDowngrade ? { scheduledPlan: null } : {}),
            },
        });
        await closeStaleManualRenewals(sub.userId, request.id);
        if (user?.email) {
            notifyAutoChargeSucceeded({
                user,
                subscription: renewed,
                amount,
                currency,
                periodEndsAt: renewed.endsAt,
                reactivated: wasPaused,
            }).catch(() => {});
        }
        return { status: "paid", requestId: request.id };
    }

    if (result.state === "pending") {
        // ePayco "Pendiente" (antifraud/3DS) or Stripe "processing" -
        // settled by the provider's webhook / the reconcile job.
        if (result.ref) {
            await prisma.planUpgradeRequest.update({ where: { id: request.id }, data: { paymentSessionId: result.ref } }).catch(() => {});
        }
        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { nextRenewalAttemptAt: new Date(now.getTime() + DAY_MS) },
        });
        return { status: "pending", requestId: request.id };
    }

    // Failed / rejected / requires_action.
    await prisma.planUpgradeRequest.update({
        where: { id: request.id },
        data: {
            paymentStatus: result.state === "rejected" ? "rejected" : "failed",
            status: "closed",
            adminResponse: `Cobro automático fallido: ${result.message || result.state}`.slice(0, 500),
        },
    });

    const nextAttemptAt = computeNextAttemptAt(sub.endsAt, attemptNumber);
    const exhausted = !nextAttemptAt;
    const updated = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
            renewalAttempts: attemptNumber,
            nextRenewalAttemptAt: nextAttemptAt,
            lastRenewalError: `${result.message || result.state}`.slice(0, 500),
            ...(exhausted ? { autoRenew: false } : {}),
        },
    });

    if (user?.email) {
        if (exhausted) {
            notifyAutoChargeRetriesExhausted({ user, subscription: updated }).catch(() => {});
        } else {
            const pauseAt = new Date(new Date(sub.endsAt).getTime() + GRACE_PERIOD_DAYS * DAY_MS);
            notifyAutoChargeFailed({
                user,
                subscription: updated,
                amount,
                currency,
                nextAttemptAt,
                willPauseAt: sub.status === "active" && pauseAt.getTime() > Date.now() ? pauseAt : null,
                requiresAction: result.state === "requires_action",
            }).catch(() => {});
        }
    }

    return { status: exhausted ? "exhausted" : "failed", requestId: request.id, nextAttemptAt };
};

// Daily scheduler entry point.
export const runDueAutoRenewals = async () => {
    const now = new Date();
    const due = await prisma.subscription.findMany({
        where: {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            status: { in: ["active", "paused"] },
            endsAt: { not: null, lte: new Date(now.getTime() + FIRST_ATTEMPT_LEAD_MS) },
            OR: [{ nextRenewalAttemptAt: null }, { nextRenewalAttemptAt: { lte: now } }],
        },
        select: { id: true },
    });

    const summary = { paid: 0, pending: 0, failed: 0, exhausted: 0, skipped: 0 };
    for (const { id } of due) {
        try {
            const outcome = await chargeSubscriptionRenewal(id);
            summary[outcome.status] = (summary[outcome.status] || 0) + 1;
        } catch (error) {
            summary.failed++;
            console.error("[auto-renew] Unexpected error charging subscription", { id, message: error?.message });
        }
    }
    if (due.length) console.log("[auto-renew] Run summary:", summary);
    return summary;
};

// Pre-charge notice (3 days before a monthly renewal, 7 before an annual
// one) plus a heads-up when the stored card expires before that charge.
export const sendUpcomingChargeNotices = async () => {
    const now = Date.now();
    const candidates = await prisma.subscription.findMany({
        where: {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            status: "active",
            renewalAttempts: 0,
            endsAt: { gt: new Date(now), lte: new Date(now + 8 * DAY_MS) },
        },
        include: { user: { select: USER_SELECT } },
    });

    let sent = 0;
    for (const sub of candidates) {
        const leadDays = sub.billingCycle === "ANNUAL" ? 7 : 3;
        const endsAtMs = new Date(sub.endsAt).getTime();
        if (endsAtMs - now > leadDays * DAY_MS) continue;
        if (sub.upcomingChargeNoticeFor && new Date(sub.upcomingChargeNoticeFor).getTime() === endsAtMs) continue;
        if (!hasStoredCard(sub) || !sub.user?.email) continue;

        const { amount, currency } = await getRenewalCharge(sub);
        if (!amount) continue;

        await notifyUpcomingAutoCharge({ user: sub.user, subscription: sub, amount, currency, chargeDate: sub.endsAt });

        const expiresBeforeCharge =
            sub.cardExpYear &&
            sub.cardExpMonth &&
            new Date(sub.cardExpYear, sub.cardExpMonth, 1).getTime() <= endsAtMs; // first day after expiry month
        if (expiresBeforeCharge) {
            await notifyCardExpiringSoon({ user: sub.user, subscription: sub, chargeDate: sub.endsAt });
        }

        await prisma.subscription.update({ where: { id: sub.id }, data: { upcomingChargeNoticeFor: sub.endsAt } });
        sent++;
    }
    if (sent) console.log(`[auto-renew] Sent ${sent} upcoming-charge notice(s).`);
    return sent;
};
