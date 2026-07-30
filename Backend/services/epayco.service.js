// Backend/services/epayco.service.js
//
// ePayco payment provider — Colombia only.
// Integrated as an additional provider alongside Stripe.
// Does NOT modify or replace any existing Stripe logic.
//
// References:
//   https://epayco.com/desarrolladores/
//   https://docs.epayco.co/

import crypto from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Resolves the public base URL of this backend service.
 * Priority:
 *  1. RENDER_EXTERNAL_URL  — set automatically by Render on every deploy
 *  2. BACKEND_URL          — explicit override (useful on other hosts)
 *  3. localhost fallback   — local development only
 */
const getBackendBaseUrl = () => {
    const candidates = [
        process.env.RENDER_EXTERNAL_URL,
        process.env.BACKEND_URL,
    ];
    for (const url of candidates) {
        const trimmed = `${url || ""}`.trim().replace(/\/$/, "");
        if (trimmed && trimmed.startsWith("http")) {
            return trimmed;
        }
    }
    return "http://localhost:3001";
};

const getEpaycoConfig = () => {
    const base = getBackendBaseUrl();
    const epaycoBase = `${base}/api/v1/subscriptions/payments/epayco`;

    // If EPAYCO_RESPONSE_URL / EPAYCO_CONFIRMATION_URL are explicitly set, use them.
    // Otherwise derive them from the backend's own public URL so no extra config is needed.
    const responseUrl =
        `${process.env.EPAYCO_RESPONSE_URL || ""}`.trim() ||
        `${epaycoBase}/response`;
    const confirmationUrl =
        `${process.env.EPAYCO_CONFIRMATION_URL || ""}`.trim() ||
        `${epaycoBase}/confirmation`;

    return {
        publicKey: `${process.env.EPAYCO_PUBLIC_KEY || ""}`.trim(),
        privateKey: `${process.env.EPAYCO_PRIVATE_KEY || ""}`.trim(),
        custId: `${process.env.EPAYCO_P_CUST_ID || ""}`.trim(),
        // ePayco expects the string "TRUE" or "FALSE"
        test: `${process.env.EPAYCO_TEST || "TRUE"}`.trim().toUpperCase() === "TRUE" ? "TRUE" : "FALSE",
        responseUrl,
        confirmationUrl,
    };
};

export const isEpaycoConfigured = () => {
    const cfg = getEpaycoConfig();
    return Boolean(cfg.publicKey && cfg.privateKey && cfg.custId);
};

// ---------------------------------------------------------------------------
// Amounts
//
// Falls back to the existing STRIPE_AMOUNT_*_COP env vars so no extra
// configuration is required unless you want separate ePayco pricing.
// ---------------------------------------------------------------------------

const EPAYCO_AMOUNT_RESOLVER = {
    growth: () =>
        Number(
            process.env.EPAYCO_AMOUNT_GROWTH_COP ||
                process.env.STRIPE_AMOUNT_GROWTH_COP ||
                0
        ),
    scale: () =>
        Number(
            process.env.EPAYCO_AMOUNT_SCALE_COP ||
                process.env.STRIPE_AMOUNT_SCALE_COP ||
                0
        ),
    enterprise: () =>
        Number(
            process.env.EPAYCO_AMOUNT_ENTERPRISE_COP ||
                process.env.STRIPE_AMOUNT_ENTERPRISE_COP ||
                0
        ),
};

export const getEpaycoAmount = (targetPlan) => {
    const resolver = EPAYCO_AMOUNT_RESOLVER[targetPlan];
    if (typeof resolver !== "function") {
        return null;
    }
    const amount = resolver();
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    return Math.round(amount);
};

// ---------------------------------------------------------------------------
// Reference generation
//
// Stored in PlanUpgradeRequest.paymentSessionId.
// Idempotent: generated once in createEpaycoCheckoutSession and reused.
// ---------------------------------------------------------------------------

export const generateEpaycoReference = (requestId) =>
    `OHNIX-${requestId}-${Date.now()}`;

// ---------------------------------------------------------------------------
// Checkout session creation
//
// Returns the same shape as other providers so payment.service.js routing
// requires minimal changes.
// ---------------------------------------------------------------------------

export const createEpaycoCheckoutSession = ({ request }) => {
    if (!isEpaycoConfigured()) {
        throw new Error("ePayco is not configured. Set EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY and EPAYCO_P_CUST_ID.");
    }

    const amount = getEpaycoAmount(request.targetPlan);
    if (!amount) {
        throw new Error(
            `ePayco COP amount is not configured for plan "${request.targetPlan}". ` +
                "Set EPAYCO_AMOUNT_GROWTH_COP (or STRIPE_AMOUNT_GROWTH_COP) etc."
        );
    }

    const reference = generateEpaycoReference(request.id);
    const frontendBase = `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");
    const checkoutUrl = `${frontendBase}/billing/epayco-checkout?requestId=${encodeURIComponent(request.id)}`;

    return {
        provider: "epayco",
        checkoutUrl,
        sessionId: reference, // stored as PlanUpgradeRequest.paymentSessionId
        country: "CO",
        paymentMethod: "epayco",
        resolvedStripeMethod: null,
        resolvedCurrency: "cop",
    };
};

// ---------------------------------------------------------------------------
// Widget parameters
//
// Called by getEpaycoCheckoutParams controller endpoint.
// The reference comes from the DB (paymentSessionId) so it is stable
// across page refreshes.
// ---------------------------------------------------------------------------

export const buildEpaycoWidgetParams = ({ request, user, reference }) => {
    const cfg = getEpaycoConfig();
    const amount = getEpaycoAmount(request.targetPlan);
    const planLabel =
        request.targetPlan.charAt(0).toUpperCase() + request.targetPlan.slice(1);

    // Embed requestId in the response URL so it is always available even if
    // ePayco does not forward x_extra1 correctly in all environments.
    const responseUrlWithId = cfg.responseUrl.includes("?")
        ? `${cfg.responseUrl}&requestId=${encodeURIComponent(request.id)}`
        : `${cfg.responseUrl}?requestId=${encodeURIComponent(request.id)}`;

    return {
        publicKey: cfg.publicKey,
        custId: cfg.custId,
        test: cfg.test,
        amount: String(amount),
        currency: "COP",
        name: `Ohnix ${planLabel}`,
        description: `Upgrade de plan ${request.currentPlan} a ${request.targetPlan}`,
        email: user.email,
        reference,
        responseUrl: responseUrlWithId,
        confirmationUrl: cfg.confirmationUrl,
        // Passed through ePayco as extra fields and returned on confirmation/response
        extra1: request.id,      // upgradeRequestId — used to activate the plan
        extra2: request.userId,  // userId
        extra3: request.targetPlan,
    };
};

// ---------------------------------------------------------------------------
// Signature validation
//
// Formula (SHA-256):
//   p_cust_id_cliente ^ p_key ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code
//
// The "^" separator is the literal caret character, NOT XOR.
// Reference: https://docs.epayco.co/payments/checksum
// ---------------------------------------------------------------------------

export const validateEpaycoSignature = ({
    custId,
    privateKey,
    refPayco,
    transactionId,
    amount,
    currencyCode,
    signature,
}) => {
    if (!custId || !privateKey || !refPayco || !transactionId || !amount || !currencyCode || !signature) {
        return false;
    }

    const raw = `${custId}^${privateKey}^${refPayco}^${transactionId}^${amount}^${currencyCode}`;
    const computed = crypto.createHash("sha256").update(raw).digest("hex");

    // Constant-time comparison to avoid timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(computed, "hex"),
            Buffer.from(signature.toLowerCase(), "hex")
        );
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------------------
// Transaction state codes
// Reference: https://docs.epayco.co/payments/transaction-status
// ---------------------------------------------------------------------------

export const EPAYCO_STATE = {
    ACCEPTED: 1,
    REJECTED: 2,
    PENDING: 3,
    FAILED: 4,
    REVERSED: 6,
    RETAINED: 7,
    STARTED: 8,
    EXPIRED: 9,
    ABANDONED: 10,
};

export const isEpaycoTransactionApproved = (stateCode) =>
    parseInt(stateCode, 10) === EPAYCO_STATE.ACCEPTED;

// ---------------------------------------------------------------------------
// Transaction query (optional fallback verification)
//
// Used when you need to verify a payment without relying solely on the
// confirmation webhook.
// Reference: https://docs.epayco.co/api/query-transaction
// ---------------------------------------------------------------------------

export const queryEpaycoTransaction = async (refPayco) => {
    const cfg = getEpaycoConfig();
    const credentials = Buffer.from(`${cfg.publicKey}:${cfg.privateKey}`).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(
            `https://secure.epayco.co/api/1.0/payment/transaction/${encodeURIComponent(refPayco)}`,
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
            }
        );

        if (!response.ok) {
            throw new Error(`ePayco transaction query returned HTTP ${response.status}`);
        }

        return response.json();
    } finally {
        clearTimeout(timeout);
    }
};
