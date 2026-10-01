import crypto from "crypto";
import Stripe from "stripe";
import { prisma } from "../db/prisma.js";
import {
    createEpaycoCardCheckoutSession,
    createEpaycoCheckoutSession,
    isEpaycoConfigured,
} from "./epayco.service.js";

const getStripe = () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        return null;
    }

    return new Stripe(secretKey, {
        apiVersion: "2026-06-24.dahlia",
    });
};

// Eurozone member states (countries that actually settle in EUR) - not the
// broader EU (which still includes non-euro members like Poland/Sweden/
// Denmark, whom Stripe would need to charge in PLN/SEK/DKK, not EUR). Ohnix
// only has EUR pricing configured (STRIPE_AMOUNT_*_EUR), so this list is
// intentionally scoped to countries where charging EUR is actually correct.
const EUR_COUNTRY_CODES = [
    "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

// Bizum is a Spain-only payment app - offering it to other Eurozone
// countries would be wrong, unlike card/sepa_debit which work pan-EU.
const buildEurCountryConfig = (country) => ({
    currency: "eur",
    supportedMethods:
        country === "ES" ? ["card", "bizum", "sepa_debit"] : ["card", "sepa_debit"],
});

// Fallback bucket for any country that isn't Colombia or a Eurozone member -
// "resto del mundo", charged in USD via Stripe card checkout. Selectable
// explicitly from the frontend as the literal country "OTHER", and also the
// implicit fallback resolveCountryConfig() resolves any other real ISO code
// to below.
const REST_OF_WORLD_CONFIG = {
    currency: "usd",
    supportedMethods: ["card"],
};

const COUNTRY_CONFIG = {
    CO: {
        currency: "cop",
        // card_token (Ohnix's own ePayco-tokenized card form - the card is
        // saved for automatic renewal) is first so it appears first in the
        // UI; "epayco" (the widget: PSE, Nequi, cash...) stays for manual
        // payments that can't be stored.
        supportedMethods: ["card_token", "epayco", "pse", "bancolombia_button", "card"],
    },
    ...Object.fromEntries(
        EUR_COUNTRY_CODES.map((code) => [code, buildEurCountryConfig(code)])
    ),
    OTHER: REST_OF_WORLD_CONFIG,
};

const truthyValues = new Set(["1", "true", "yes", "on"]);

const isEnvFlagEnabled = (value) =>
    truthyValues.has(`${value || ""}`.trim().toLowerCase());

const DIRECT_CO_METHOD_ENDPOINTS = {
    pse: process.env.COLOMBIA_DIRECT_PSE_ENDPOINT || "/payments/pse/checkout",
    bancolombia_button:
        process.env.COLOMBIA_DIRECT_BANCOLOMBIA_ENDPOINT ||
        "/payments/bancolombia/checkout",
};

const PAYMENT_METHOD_TO_STRIPE_TYPE = {
    card: "card",
    pse: "pse",
    ach: "pse",
    bancolombia_button: "bancolombia",
    bizum: "bizum",
    sepa_debit: "sepa_debit",
};

const getStripeMethodCandidates = ({ paymentMethod, country }) => {
    const primary = PAYMENT_METHOD_TO_STRIPE_TYPE[paymentMethod];
    if (!primary) {
        return ["card"];
    }

    // PSE and Bancolombia were removed from Stripe's API in 2026.
    // When Colombia direct checkout is unavailable, fall back to card.
    if (country === "CO" && ["pse", "bancolombia_button"].includes(paymentMethod)) {
        return ["card"];
    }

    return [primary, "card"].filter((v, i, arr) => arr.indexOf(v) === i);
};

const getCurrencyCandidates = ({ country, preferredCurrency }) => {
    const base = [preferredCurrency];
    if (country === "CO") {
        return [...new Set([...base, "usd", "eur"])];
    }

    return base;
};

const isInvalidPaymentMethodTypeError = (error) =>
    error?.type === "StripeInvalidRequestError" &&
    error?.rawType === "invalid_request_error" &&
    error?.param === "payment_method_types[0]";

const isUnsupportedCurrencyMethodComboError = (error) => {
    const message = `${error?.raw?.message || error?.message || ""}`.toLowerCase();
    return (
        error?.type === "StripeInvalidRequestError" &&
        error?.rawType === "invalid_request_error" &&
        (
            message.includes("supported by the default currency") ||
            message.includes("must convert to at least 50 cents")
        )
    );
};

const normalizePaymentMethod = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();

    if (["bancolombia_button", "boton_bancolombia", "bancolombia"].includes(normalized)) {
        return "bancolombia_button";
    }

    if (["pse", "ach", "ach_pse", "bank_transfer"].includes(normalized)) {
        return "pse";
    }

    return normalized;
};

const PLAN_ONE_TIME_AMOUNT_BY_CURRENCY = {
    starter: {
        cop: () => Number(process.env.STRIPE_AMOUNT_STARTER_COP),
        usd: () => Number(process.env.STRIPE_AMOUNT_STARTER_USD),
        eur: () => Number(process.env.STRIPE_AMOUNT_STARTER_EUR),
    },
    growth: {
        cop: () => Number(process.env.STRIPE_AMOUNT_GROWTH_COP),
        usd: () => Number(process.env.STRIPE_AMOUNT_GROWTH_USD),
        eur: () => Number(process.env.STRIPE_AMOUNT_GROWTH_EUR),
    },
    scale: {
        cop: () => Number(process.env.STRIPE_AMOUNT_SCALE_COP),
        usd: () => Number(process.env.STRIPE_AMOUNT_SCALE_USD),
        eur: () => Number(process.env.STRIPE_AMOUNT_SCALE_EUR),
    },
    enterprise: {
        cop: () => Number(process.env.STRIPE_AMOUNT_ENTERPRISE_COP),
        usd: () => Number(process.env.STRIPE_AMOUNT_ENTERPRISE_USD),
        eur: () => Number(process.env.STRIPE_AMOUNT_ENTERPRISE_EUR),
    },
};

const getColombiaDirectConfig = () => {
    const baseUrl = `${process.env.COLOMBIA_DIRECT_BASE_URL || ""}`.trim().replace(
        /\/$/,
        ""
    );

    return {
        enabled: isEnvFlagEnabled(process.env.COLOMBIA_DIRECT_PAYMENTS_ENABLED),
        strict: isEnvFlagEnabled(process.env.COLOMBIA_DIRECT_PAYMENTS_STRICT),
        baseUrl,
        apiKey: `${process.env.COLOMBIA_DIRECT_API_KEY || ""}`.trim(),
        providerName: `${process.env.COLOMBIA_DIRECT_PROVIDER_NAME || "co_direct"}`
            .trim()
            .toLowerCase(),
        timeoutMs: Number(process.env.COLOMBIA_DIRECT_TIMEOUT_MS || 15000),
    };
};

const getSuccessUrl = (requestId) => {
    const frontendBase =
        process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:5173";

    return `${frontendBase}/billing/payment-success?requestId=${encodeURIComponent(requestId)}&session_id={CHECKOUT_SESSION_ID}`;
};

const getCancelUrl = (requestId) => {
    const frontendBase =
        process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:5173";

    return `${frontendBase}/billing?payment=cancelled&requestId=${encodeURIComponent(requestId)}`;
};

// Any real ISO country code that isn't Colombia or a Eurozone member falls
// through to the USD "rest of world" bucket instead of being rejected - a
// checkout attempt from e.g. the US or Mexico used to throw "Unsupported
// checkout country" here because COUNTRY_CONFIG only ever listed CO and ES.
export const resolveCountryConfig = (country) => {
    const normalized = `${country || ""}`.trim().toUpperCase();
    if (!normalized) {
        return null;
    }
    const config = COUNTRY_CONFIG[normalized] || REST_OF_WORLD_CONFIG;
    return { country: normalized, ...config };
};

// currency used for a given country's public pricing/checkout - "cop",
// "eur", or "usd". Shared by the public pricing endpoint so the number a
// visitor sees always matches what resolveCountryConfig() would charge them.
// Falls back to "cop" (not "usd") when no country was detected/passed -
// Ohnix's primary market is Colombia, so a failed/blocked geo-IP lookup
// (ad blockers, timeouts, ipwho.is being down) should default to the price
// most visitors actually expect instead of silently showing USD.
export const getCurrencyForCountry = (country) => resolveCountryConfig(country)?.currency || "cop";

// billingCycle "ANNUAL" means "paga 10 meses, lleva 12" - the charged amount
// is simply 10x the monthly price, computed here rather than read from a
// separate ANNUAL env var, so a monthly price change can never drift out of
// sync with its annual equivalent. COP is zero-decimal and USD/EUR amounts
// are already in cents, so x10 is always exact - no rounding loss.
export const getAmountForPlanAndCurrency = (targetPlan, currency, billingCycle = "MONTHLY") => {
    const planConfig = PLAN_ONE_TIME_AMOUNT_BY_CURRENCY[targetPlan];
    const resolver = planConfig?.[currency];
    if (typeof resolver !== "function") {
        return null;
    }

    const amount = resolver();
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    const cycleAmount = billingCycle === "ANNUAL" ? amount * 10 : amount;
    return Math.round(cycleAmount);
};

const createColombiaDirectCheckoutSession = async ({
    request,
    user,
    paymentMethod,
    country,
}) => {
    const directConfig = getColombiaDirectConfig();

    if (!directConfig.enabled) {
        throw new Error("Colombia direct payments are disabled");
    }

    if (!directConfig.baseUrl) {
        throw new Error("COLOMBIA_DIRECT_BASE_URL is required for direct payments");
    }

    const endpointPath = DIRECT_CO_METHOD_ENDPOINTS[paymentMethod];
    if (!endpointPath) {
        throw new Error("Direct integration is not available for this payment method");
    }

    const amount = getAmountForPlanAndCurrency(request.targetPlan, "cop", request.billingCycle);
    if (!amount) {
        throw new Error("Colombia direct payments require COP amounts to be configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), directConfig.timeoutMs);

    try {
        const endpointUrl = `${directConfig.baseUrl}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;

        const response = await fetch(endpointUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(directConfig.apiKey
                    ? { Authorization: `Bearer ${directConfig.apiKey}` }
                    : {}),
            },
            body: JSON.stringify({
                requestId: request.id,
                userId: request.userId,
                customerEmail: user.email,
                customerName: user.username,
                currentPlan: request.currentPlan,
                targetPlan: request.targetPlan,
                amount,
                currency: "cop",
                billingCycle: request.billingCycle,
                paymentMethod,
                country,
                successUrl: getSuccessUrl(request.id),
                cancelUrl: getCancelUrl(request.id),
                metadata: {
                    source: "ohnix",
                    upgradeRequestId: request.id,
                },
            }),
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                payload?.message ||
                    `Colombia direct checkout failed with status ${response.status}`
            );
        }

        const checkoutUrl =
            payload?.checkoutUrl || payload?.paymentUrl || payload?.redirectUrl;
        const sessionId =
            payload?.sessionId || payload?.id || payload?.reference || request.id;

        if (!checkoutUrl) {
            throw new Error("Colombia direct checkout did not return a checkout URL");
        }

        return {
            provider: directConfig.providerName,
            checkoutUrl,
            sessionId: `${sessionId}`,
            country,
            paymentMethod,
            resolvedStripeMethod: null,
            resolvedCurrency: "cop",
        };
    } finally {
        clearTimeout(timeout);
    }
};

export const isAutonomousCheckoutConfigured = () => {
    const stripe = getStripe();
    return Boolean(stripe) || isEpaycoConfigured();
};

export const verifyStripeSession = async (sessionId) => {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe not configured");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session?.payment_status === "paid";
};

// Richer than verifyStripeSession: a checkout session that isn't paid can
// still be genuinely different states - still open and awaiting the
// customer, or definitively `expired` (Stripe auto-expires unpaid sessions,
// 24h after creation by default). Callers need that distinction to decide
// whether a stuck "pending" PlanUpgradeRequest can safely be unblocked for a
// retry, vs. still has a real payment in flight.
export const getStripeCheckoutSessionState = async (sessionId) => {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe not configured");
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
        paid: session?.payment_status === "paid",
        // Stripe Checkout Session.status: "open" | "complete" | "expired"
        status: session?.status || null,
        paymentStatus: session?.payment_status || null,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000) : null,
        session,
    };
};

export const getSupportedPaymentMethodsByCountry = () =>
    Object.entries(COUNTRY_CONFIG).reduce((acc, [country, config]) => {
        acc[country] = [...config.supportedMethods];
        return acc;
    }, {});

export const createUpgradeCheckoutSession = async ({
    request,
    user,
    paymentMethod,
    country,
}) => {
    const stripe = getStripe();

    const countryConfig = resolveCountryConfig(country);
    if (!countryConfig) {
        throw new Error("Unsupported checkout country");
    }

    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!countryConfig.supportedMethods.includes(normalizedPaymentMethod)) {
        throw new Error("Selected payment method is not available for this country");
    }

    // ── ePayco: Colombia-only provider ─────────────────────────────────────
    if (normalizedPaymentMethod === "epayco") {
        return createEpaycoCheckoutSession({ request, user });
    }
    if (normalizedPaymentMethod === "card_token") {
        return createEpaycoCardCheckoutSession({ request, user });
    }
    // ───────────────────────────────────────────────────────────────────────

    const stripePaymentMethodCandidates = getStripeMethodCandidates({
        paymentMethod: normalizedPaymentMethod,
        country: countryConfig.country,
    });

    if (!stripePaymentMethodCandidates.length) {
        throw new Error("Unsupported payment method");
    }

    const shouldTryColombiaDirect =
        countryConfig.country === "CO" &&
        ["pse", "bancolombia_button"].includes(normalizedPaymentMethod);

    if (shouldTryColombiaDirect) {
        const directConfig = getColombiaDirectConfig();

        try {
            return await createColombiaDirectCheckoutSession({
                request,
                user,
                paymentMethod: normalizedPaymentMethod,
                country: countryConfig.country,
            });
        } catch (directError) {
            console.warn(
                "Colombia direct checkout unavailable. Falling back to Stripe.",
                directError?.message || directError
            );

            if (directConfig.strict) {
                throw directError;
            }
        }
    }

    if (!stripe) {
        throw new Error("Autonomous checkout is not configured");
    }

    const currencyCandidates = getCurrencyCandidates({
        country: countryConfig.country,
        preferredCurrency: countryConfig.currency,
    });

    let session = null;
    let resolvedStripeMethod = null;
    let resolvedCurrency = null;
    let lastError = null;

    for (const candidateCurrency of currencyCandidates) {
        const amount = getAmountForPlanAndCurrency(
            request.targetPlan,
            candidateCurrency,
            request.billingCycle
        );
        if (!amount) {
            continue;
        }

        for (const candidateMethod of stripePaymentMethodCandidates) {
            try {
                // Minute-bucketed so a double-click or a browser's automatic
                // retry of this same request within that window reuses the
                // same Stripe session instead of creating a second one -
                // but a genuinely new attempt later still gets a fresh key.
                // Varies per candidate too, since Stripe rejects reusing a
                // key with different request parameters.
                const idempotencyKey = `checkout_${request.id}_${candidateCurrency}_${candidateMethod}_${new Date()
                    .toISOString()
                    .slice(0, 16)}`;

                // A card paid here is saved on a Stripe Customer for
                // automatic renewal (chargeStripeOffSession) - other
                // methods (SEPA/Bizum) stay one-off manual payments.
                const saveCard = candidateMethod === "card";
                const stripeCustomerId = saveCard
                    ? await ensureStripeCustomerForUser({ stripe, user })
                    : null;

                session = await stripe.checkout.sessions.create(
                    {
                        mode: "payment",
                        ...(stripeCustomerId
                            ? {
                                  customer: stripeCustomerId,
                                  payment_intent_data: { setup_future_usage: "off_session" },
                                  custom_text: {
                                      submit: { message: RECURRING_CONSENT_TEXT_STRIPE },
                                  },
                              }
                            : { customer_email: user.email }),
                        payment_method_types: [candidateMethod],
                        line_items: [
                            {
                                price_data: {
                                    currency: candidateCurrency,
                                    product_data: {
                                        name: `Ohnix ${request.targetPlan} upgrade${request.billingCycle === "ANNUAL" ? " (annual)" : ""}`,
                                        description: `Plan upgrade from ${request.currentPlan} to ${request.targetPlan}${request.billingCycle === "ANNUAL" ? " - annual billing (10x monthly)" : ""}`,
                                    },
                                    unit_amount: amount,
                                },
                                quantity: 1,
                            },
                        ],
                        success_url: getSuccessUrl(request.id),
                        cancel_url: getCancelUrl(request.id),
                        metadata: {
                            upgradeRequestId: request.id,
                            userId: request.userId,
                            currentPlan: request.currentPlan,
                            targetPlan: request.targetPlan,
                            // Informational mirror only - activation re-reads
                            // billingCycle from the PlanUpgradeRequest row in
                            // the DB, never from this metadata (see
                            // activateFromCheckoutSession).
                            billingCycle: request.billingCycle,
                            checkoutCountry: countryConfig.country,
                            checkoutPaymentMethod: normalizedPaymentMethod,
                            checkoutPaymentMethodResolved: candidateMethod,
                            checkoutCurrencyResolved: candidateCurrency,
                            saveCardForAutoRenew: saveCard ? "true" : "false",
                        },
                    },
                    { idempotencyKey }
                );
                resolvedStripeMethod = candidateMethod;
                resolvedCurrency = candidateCurrency;
                break;
            } catch (error) {
                lastError = error;
                if (
                    isInvalidPaymentMethodTypeError(error) ||
                    isUnsupportedCurrencyMethodComboError(error)
                ) {
                    continue;
                }

                throw error;
            }
        }

        if (session) {
            break;
        }
    }

    if (!session) {
        throw (
            lastError ||
            new Error(
                "Selected payment method is not available for this Stripe account"
            )
        );
    }

    return {
        provider: "stripe",
        checkoutUrl: session.url,
        sessionId: session.id,
        country: countryConfig.country,
        paymentMethod: normalizedPaymentMethod,
        resolvedStripeMethod,
        resolvedCurrency,
    };
};

// ---------------------------------------------------------------------------
// Stored-card (auto-renewal) helpers - see subscriptionAutoRenew.service.js
// ---------------------------------------------------------------------------

const RECURRING_CONSENT_TEXT_STRIPE =
    "Tu tarjeta quedará guardada y se cobrará automáticamente en cada renovación de tu plan Ohnix hasta que desactives la renovación automática en Facturación. / Your card will be saved and charged automatically at each renewal until you turn off automatic renewal in Billing.";

// One Stripe Customer per Ohnix account, stored on Subscription so repeat
// checkouts and renewals reuse the same saved card.
export const ensureStripeCustomerForUser = async ({ stripe = getStripe(), user }) => {
    if (!stripe) throw new Error("Stripe is not configured");
    const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { stripeCustomerId: true },
    });
    if (subscription?.stripeCustomerId) return subscription.stripeCustomerId;

    const customer = await stripe.customers.create(
        {
            email: user.email,
            name: user.username || undefined,
            metadata: { ohnixUserId: user.id },
        },
        { idempotencyKey: `ohnix_customer_${user.id}` }
    );
    await prisma.subscription.updateMany({
        where: { userId: user.id },
        data: { stripeCustomerId: customer.id },
    });
    return customer.id;
};

export const getStripePaymentMethodSummary = async (paymentMethodId) => {
    const stripe = getStripe();
    if (!stripe || !paymentMethodId) return null;
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    return {
        id: pm.id,
        brand: pm.card?.brand || pm.type,
        last4: pm.card?.last4 || null,
        expMonth: pm.card?.exp_month || null,
        expYear: pm.card?.exp_year || null,
    };
};

const extractId = (value) => (typeof value === "string" ? value : value?.id || null);

// Resolves the PaymentMethod a completed checkout session left behind: the
// payment-mode session's PaymentIntent (setup_future_usage) or a setup-mode
// session's SetupIntent.
export const getPaymentMethodFromCheckoutSession = async (session) => {
    const stripe = getStripe();
    if (!stripe || !session) return null;
    if (session.mode === "setup" && session.setup_intent) {
        const intent = await stripe.setupIntents.retrieve(extractId(session.setup_intent));
        return extractId(intent.payment_method);
    }
    if (session.payment_intent) {
        const intent = await stripe.paymentIntents.retrieve(extractId(session.payment_intent));
        return extractId(intent.payment_method);
    }
    return null;
};

// "Cambiar tarjeta" for a Stripe customer - Stripe-hosted setup page that
// validates the new card (including 3DS) without charging it.
export const createStripeSetupSession = async ({ user }) => {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");
    const customerId = await ensureStripeCustomerForUser({ stripe, user });
    const frontendBase = process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        payment_method_types: ["card"],
        success_url: `${frontendBase}/billing?card=updated`,
        cancel_url: `${frontendBase}/billing?card=cancelled`,
        custom_text: { submit: { message: RECURRING_CONSENT_TEXT_STRIPE } },
        metadata: { ohnixUserId: user.id, purpose: "auto_renew_card_update" },
    });
    return { checkoutUrl: session.url, sessionId: session.id };
};

// Server-initiated renewal charge against the saved card. Never throws.
// A card that needs 3DS for this particular charge fails with
// authentication_required - reported as "requires_action" so the customer
// gets a link to pay manually instead.
export const chargeStripeOffSession = async ({
    customerId,
    paymentMethodId,
    amount,
    currency,
    description,
    metadata,
    idempotencyKey,
}) => {
    const stripe = getStripe();
    if (!stripe) return { success: false, state: "failed", ref: null, message: "Stripe is not configured" };
    try {
        const intent = await stripe.paymentIntents.create(
            {
                amount,
                currency,
                customer: customerId,
                payment_method: paymentMethodId,
                off_session: true,
                confirm: true,
                description,
                metadata,
            },
            idempotencyKey ? { idempotencyKey } : undefined
        );
        const success = intent.status === "succeeded";
        return {
            success,
            state: success ? "approved" : intent.status === "processing" ? "pending" : "failed",
            ref: intent.id,
            amount: intent.amount_received || intent.amount,
            currency: intent.currency,
            isTest: !intent.livemode,
            message: success ? null : intent.status,
        };
    } catch (error) {
        return {
            success: false,
            state: error?.code === "authentication_required" ? "requires_action" : "failed",
            ref: error?.raw?.payment_intent?.id || null,
            message: error?.raw?.message || error?.message || String(error),
        };
    }
};


export const parseStripeWebhookEvent = ({ rawBody, signature }) => {
    const stripe = getStripe();
    if (!stripe) {
        throw new Error("Stripe is not configured");
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not configured - refusing to process an unsigned webhook");
    }
    if (!signature) {
        throw new Error("Missing stripe-signature header - refusing to process an unsigned webhook");
    }

    // stripe.webhooks.constructEvent cryptographically verifies rawBody was
    // actually sent by Stripe using webhookSecret - this is the only thing
    // standing between "anyone on the internet" and a free plan activation
    // (see closeApprovedRequestAndActivatePlan), so there is no fallback path.
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};

const isDirectProviderWebhook = (headers = {}, parsedBody = null) => {
    const headerValue =
        headers["x-payment-provider"] || headers["x-provider"] || headers["x-webhook-provider"];
    const normalizedHeader = `${headerValue || ""}`.trim().toLowerCase();
    const normalizedBodyProvider = `${parsedBody?.provider || ""}`.trim().toLowerCase();

    return normalizedHeader.includes("co_direct") || normalizedBodyProvider === "co_direct";
};

const validateDirectWebhookSecret = (headers = {}) => {
    const configuredSecret = `${process.env.COLOMBIA_DIRECT_WEBHOOK_SECRET || ""}`.trim();
    // Fail closed: an unset secret must never mean "trust the request" - that
    // would let anyone claiming to be co_direct activate a plan for free.
    if (!configuredSecret) {
        return false;
    }

    const incomingSecret =
        `${headers["x-webhook-secret"] || headers["x-signature-token"] || ""}`.trim();
    if (!incomingSecret) {
        return false;
    }

    const configuredBuffer = Buffer.from(configuredSecret);
    const incomingBuffer = Buffer.from(incomingSecret);
    if (configuredBuffer.length !== incomingBuffer.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(configuredBuffer, incomingBuffer);
    } catch {
        return false;
    }
};

export const parsePaymentWebhookEvent = ({ rawBody, headers = {}, signature }) => {
    const parsedBody = Buffer.isBuffer(rawBody)
        ? JSON.parse(rawBody.toString("utf8"))
        : rawBody;

    if (isDirectProviderWebhook(headers, parsedBody)) {
        if (!validateDirectWebhookSecret(headers)) {
            throw new Error("Invalid direct webhook secret");
        }

        return {
            provider: "co_direct",
            type:
                parsedBody?.type ||
                parsedBody?.event ||
                (parsedBody?.status === "paid" ? "payment.succeeded" : "payment.updated"),
            data: {
                object: parsedBody?.data || parsedBody,
            },
        };
    }

    const stripeEvent = parseStripeWebhookEvent({ rawBody, signature });
    return {
        ...stripeEvent,
        provider: "stripe",
    };
};