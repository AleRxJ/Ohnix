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
    const frontendBase = `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");

    // If EPAYCO_RESPONSE_URL / EPAYCO_CONFIRMATION_URL are explicitly set, use them.
    // Otherwise derive them so no extra config is needed. The response URL
    // (the browser redirect target right after checkout) defaults to the
    // FRONTEND, not the backend, on purpose: the backend runs on Render's
    // free tier, which spins down after inactivity - a customer who just
    // paid landing on Render's own "waking up" splash for 15-50s before
    // ever seeing Ohnix is a real, observed bad first impression. The
    // static frontend has no such cold start. The routing decision this
    // page makes is pure UX triage (which shell page to show), not a trust
    // boundary - actual payment truth still only ever comes from the
    // signed confirmation webhook below. See EpaycoResponseRedirect.jsx.
    const responseUrl =
        `${process.env.EPAYCO_RESPONSE_URL || ""}`.trim() ||
        `${frontendBase}/billing/epayco-response`;
    // The confirmation webhook is server-to-server (ePayco calling us, not
    // the customer's browser) - it must stay on the backend, and its own
    // cold-start delay doesn't create the same bad first impression since
    // the customer never sees it directly.
    const confirmationUrl =
        `${process.env.EPAYCO_CONFIRMATION_URL || ""}`.trim() ||
        `${epaycoBase}/confirmation`;

    return {
        publicKey: `${process.env.EPAYCO_PUBLIC_KEY || ""}`.trim(),
        privateKey: `${process.env.EPAYCO_PRIVATE_KEY || ""}`.trim(),
        // P_KEY is a distinct secret from Private Key, found alongside
        // P_CUST_ID_CLIENTE/PUBLIC_KEY in the ePayco dashboard under
        // Configuración > Personalizaciones > Llaves Secretas (or
        // Integraciones > Llaves API > Llaves Secretas) - it's the value
        // ePayco actually signs confirmation webhooks with, confirmed
        // against their own PHP reference implementation
        // (github.com/epayco/resources). Falls back to privateKey only so
        // this doesn't hard-break for anyone who genuinely has the same
        // value for both - but confirmed-mismatched signatures in
        // production logs point to this being the real fix.
        signatureKey: `${process.env.EPAYCO_P_KEY || process.env.EPAYCO_PRIVATE_KEY || ""}`.trim(),
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
    starter: () =>
        Number(
            process.env.EPAYCO_AMOUNT_STARTER_COP ||
                process.env.STRIPE_AMOUNT_STARTER_COP ||
                0
        ),
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

// billingCycle "ANNUAL" = "paga 10 meses, lleva 12" - same x10 rule as
// payment.service.js#getAmountForPlanAndCurrency, kept here as its own
// multiplication rather than a shared import so this file's COP-only amount
// resolution stays self-contained. COP is zero-decimal, so x10 is exact.
export const getEpaycoAmount = (targetPlan, billingCycle = "MONTHLY") => {
    const resolver = EPAYCO_AMOUNT_RESOLVER[targetPlan];
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

    const amount = getEpaycoAmount(request.targetPlan, request.billingCycle);
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
    const amount = getEpaycoAmount(request.targetPlan, request.billingCycle);
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
        name: `Ohnix ${planLabel}${request.billingCycle === "ANNUAL" ? " (anual)" : ""}`,
        description: `Upgrade de plan ${request.currentPlan} a ${request.targetPlan}${request.billingCycle === "ANNUAL" ? " - facturación anual (10x mensual)" : ""}`,
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
        const valid = crypto.timingSafeEqual(
            Buffer.from(computed, "hex"),
            Buffer.from(signature.toLowerCase(), "hex")
        );
        if (!valid) {
            // Diagnostic only - never logs privateKey. A mismatch here with
            // otherwise-correct-looking fields usually means EPAYCO_PRIVATE_KEY
            // isn't the same "P_KEY" ePayco used to sign this confirmation -
            // some ePayco accounts have a P_KEY distinct from the API secret
            // key used for Basic Auth on REST calls. Verify in the ePayco
            // dashboard (Integraciones / Llaves) if this fires again.
            console.warn("[epayco] Signature mismatch", {
                custId, refPayco, transactionId, amount, currencyCode,
                receivedSignature: signature,
                computedSignature: computed,
            });
        }
        return valid;
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
    // Not in ePayco's public docs (missing from the state list at the
    // Reference link above) - confirmed by querying a live production
    // transaction that ePayco's own merchant dashboard showed as
    // "Cancelada": it came back with x_cod_transaction_state: 11 and
    // x_transaction_state: "Cancelada".
    CANCELLED: 11,
};

export const isEpaycoTransactionApproved = (stateCode) =>
    parseInt(stateCode, 10) === EPAYCO_STATE.ACCEPTED;

// Belt-and-suspenders for any *other* state ePayco adds later that isn't in
// the enum above (same blind spot CANCELLED was in until it got confirmed
// by hand) - callers fall back to this text match on x_response /
// x_response_reason_text instead of silently doing nothing.
export const isEpaycoCancelledResponse = (responseText) =>
    `${responseText || ""}`.toLowerCase().includes("cancel");

// ePayco includes x_test_request on both the confirmation webhook and the
// transaction query response - truthy when the transaction ran against
// their sandbox keys. Returns null (not false) when the field is missing
// or blank, since an absent flag means "we don't actually know", not
// "definitely a real charge" - conflating the two would mislabel a real
// payment as untested just because one particular response happened to
// omit the field. Powers the admin payments ledger's test/real distinction.
export const parseEpaycoTestFlag = (value) => {
    if (value === undefined || value === null || value === "") return null;
    return ["1", "true", "yes"].includes(`${value}`.trim().toLowerCase());
};

// ---------------------------------------------------------------------------
// Transaction query (optional fallback verification)
//
// Used when you need to verify a payment without relying solely on the
// confirmation webhook - this is what the reconcile job (every 15 min, see
// server.js) and the frontend's "verify now" fallbacks use to self-heal a
// stuck pending payment without a human touching anything.
//
// Reference: https://docs.epayco.com/docs/paginas-de-respuestas.
// This previously called GET /validation/v1/reference/{ref_payco} with no
// auth, per that doc page - but that endpoint reliably returns
// {"status":false,"message":"Error de datos o conexión."} for real
// transactions (confirmed against a live production ref_payco, and matches
// a long-standing unresolved report: github.com/epayco/resources/issues/13).
// The endpoint the official epayco-sdk-node package actually uses instead
// (lib/resources/charge.js) is this authenticated one, confirmed working
// against the same live transaction.
// ---------------------------------------------------------------------------

// The bearer token from /v1/auth/login is valid for a while and reconcile
// runs can check several pending payments per cycle - caching it in memory
// for this process avoids a fresh login call per transaction. Cleared and
// re-fetched on the next call whenever it's missing/expired, or once on a
// 401 from the transaction query itself (token revoked/rejected server-side
// despite our own expiry estimate).
let cachedApiToken = null;

const fetchEpaycoApiToken = async () => {
    const { publicKey, privateKey } = getEpaycoConfig();
    const response = await fetch("https://api.secure.payco.co/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key: publicKey, private_key: privateKey }),
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok || !parsed?.bearer_token) {
        throw new Error(
            parsed?.message || `ePayco auth login returned HTTP ${response.status}`
        );
    }
    // Not parsed from the JWT's own exp claim to avoid a dependency just for
    // this - 10 minutes is comfortably under ePayco's token lifetime and the
    // 401 fallback below covers the rest.
    cachedApiToken = { token: parsed.bearer_token, expiresAt: Date.now() + 10 * 60 * 1000 };
    return cachedApiToken.token;
};

const getEpaycoApiToken = async () => {
    if (cachedApiToken && cachedApiToken.expiresAt > Date.now() + 5000) {
        return cachedApiToken.token;
    }
    return fetchEpaycoApiToken();
};

export const queryEpaycoTransaction = async (refPayco) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const { publicKey } = getEpaycoConfig();
        const requestOnce = async (token) =>
            fetch(
                `https://secure.payco.co/restpagos/transaction/response.json?ref_payco=${encodeURIComponent(refPayco)}&public_key=${encodeURIComponent(publicKey)}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        type: "sdk-jwt",
                        lang: "NODE",
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    signal: controller.signal,
                }
            );

        let token = await getEpaycoApiToken();
        let response = await requestOnce(token);

        if (response.status === 401) {
            // Cached token rejected - force a fresh login once and retry,
            // instead of failing the whole reconcile pass on a stale cache.
            cachedApiToken = null;
            token = await getEpaycoApiToken();
            response = await requestOnce(token);
        }

        const rawText = await response.text();
        let parsed = null;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            console.error("[epayco] Transaction query returned non-JSON response", {
                refPayco,
                status: response.status,
                bodyPreview: rawText.slice(0, 300),
            });
            throw new Error(`ePayco transaction query returned a non-JSON response (HTTP ${response.status})`);
        }

        if (!response.ok) {
            throw new Error(
                parsed?.message || parsed?.description || `ePayco transaction query returned HTTP ${response.status}`
            );
        }

        return parsed;
    } finally {
        clearTimeout(timeout);
    }
};
