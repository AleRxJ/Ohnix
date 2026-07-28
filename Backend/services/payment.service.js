import Stripe from "stripe";

const getStripe = () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        return null;
    }

    return new Stripe(secretKey, {
        apiVersion: "2024-06-20",
    });
};

const COUNTRY_CONFIG = {
    CO: {
        currency: "cop",
        supportedMethods: ["pse", "bancolombia_button", "card"],
    },
    ES: {
        currency: "eur",
        supportedMethods: ["card", "bizum", "sepa_debit"],
    },
};

const PAYMENT_METHOD_TO_STRIPE_TYPE = {
    card: "card",
    pse: "pse",
    bancolombia_button: "pse",
    bizum: "bizum",
    sepa_debit: "sepa_debit",
};

const normalizePaymentMethod = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();

    if (["bancolombia_button", "boton_bancolombia", "bancolombia"].includes(normalized)) {
        return "bancolombia_button";
    }

    return normalized;
};

const PLAN_ONE_TIME_AMOUNT_BY_CURRENCY = {
    growth: {
        cop: () => Number(process.env.STRIPE_AMOUNT_GROWTH_COP),
        eur: () => Number(process.env.STRIPE_AMOUNT_GROWTH_EUR),
    },
    enterprise: {
        cop: () => Number(process.env.STRIPE_AMOUNT_ENTERPRISE_COP),
        eur: () => Number(process.env.STRIPE_AMOUNT_ENTERPRISE_EUR),
    },
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

const resolveCountryConfig = (country) => {
    const normalized = `${country || ""}`.trim().toUpperCase();
    return COUNTRY_CONFIG[normalized] ? { country: normalized, ...COUNTRY_CONFIG[normalized] } : null;
};

const getAmountForPlanAndCurrency = (targetPlan, currency) => {
    const planConfig = PLAN_ONE_TIME_AMOUNT_BY_CURRENCY[targetPlan];
    const resolver = planConfig?.[currency];
    if (typeof resolver !== "function") {
        return null;
    }

    const amount = resolver();
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return Math.round(amount);
};

export const isAutonomousCheckoutConfigured = () => {
    const stripe = getStripe();
    return Boolean(stripe);
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
    if (!stripe) {
        throw new Error("Autonomous checkout is not configured");
    }

    const countryConfig = resolveCountryConfig(country);
    if (!countryConfig) {
        throw new Error("Unsupported checkout country");
    }

    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!countryConfig.supportedMethods.includes(normalizedPaymentMethod)) {
        throw new Error("Selected payment method is not available for this country");
    }

    const stripePaymentMethodType = PAYMENT_METHOD_TO_STRIPE_TYPE[normalizedPaymentMethod];
    if (!stripePaymentMethodType) {
        throw new Error("Unsupported payment method");
    }

    const amount = getAmountForPlanAndCurrency(
        request.targetPlan,
        countryConfig.currency
    );

    if (!amount) {
        throw new Error(
            `Missing one-time amount for ${request.targetPlan} in ${countryConfig.currency}`
        );
    }

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email,
        payment_method_types: [stripePaymentMethodType],
        line_items: [
            {
                price_data: {
                    currency: countryConfig.currency,
                    product_data: {
                        name: `Ohnix ${request.targetPlan} upgrade`,
                        description: `Plan upgrade from ${request.currentPlan} to ${request.targetPlan}`,
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
            checkoutCountry: countryConfig.country,
            checkoutPaymentMethod: normalizedPaymentMethod,
        },
    });

    return {
        provider: "stripe",
        checkoutUrl: session.url,
        sessionId: session.id,
        country: countryConfig.country,
        paymentMethod: normalizedPaymentMethod,
    };
};

export const parseStripeWebhookEvent = ({ rawBody, signature }) => {
    const stripe = getStripe();
    if (!stripe) {
        throw new Error("Stripe is not configured");
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }

    const parsedBody = Buffer.isBuffer(rawBody)
        ? JSON.parse(rawBody.toString("utf8"))
        : rawBody;

    return parsedBody;
};