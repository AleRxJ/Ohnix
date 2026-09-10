// Backend/services/certificateOrderPayment.service.js
//
// ePayco payment plumbing for CertificateOrder (Viafirma digital-certificate
// purchases) - deliberately its own small file rather than added onto
// epayco.service.js, since every amount/widget/URL helper there is hardcoded
// to PlanUpgradeRequest's shape (targetPlan/billingCycle). The generic,
// provider-level pieces (signature validation, transaction-state enum,
// REST fallback query) still come straight from epayco.service.js - only the
// certificate-specific amount/widget/URL logic lives here.

import crypto from "crypto";

const getBackendBaseUrl = () => {
    const candidates = [process.env.RENDER_EXTERNAL_URL, process.env.BACKEND_URL];
    for (const url of candidates) {
        const trimmed = `${url || ""}`.trim().replace(/\/$/, "");
        if (trimmed && trimmed.startsWith("http")) return trimmed;
    }
    return "http://localhost:3001";
};

const getFrontendBaseUrl = () => `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");

export const getCertificateOrderEpaycoUrls = () => {
    const base = getBackendBaseUrl();
    const certBase = `${base}/api/v1/certificate-orders/payments/epayco`;
    const frontendBase = getFrontendBaseUrl();
    return {
        // Browser lands here after PSE/redirect-based methods - stays on the
        // frontend for the same cold-start reasoning as
        // epayco.service.js#getEpaycoConfig's own responseUrl.
        responseUrl: `${frontendBase}/fiscal-setup/certificate-payment-response`,
        confirmationUrl: `${certBase}/confirmation`,
    };
};

export const isEpaycoConfiguredForCertificateOrders = () => {
    const publicKey = `${process.env.EPAYCO_PUBLIC_KEY || ""}`.trim();
    const privateKey = `${process.env.EPAYCO_PRIVATE_KEY || ""}`.trim();
    const custId = `${process.env.EPAYCO_P_CUST_ID || ""}`.trim();
    return Boolean(publicKey && privateKey && custId);
};

// Ohnix's own resale price (see ViafirmaSelfService.jsx's VIAFIRMA_PRICE_1_YEAR/
// VIAFIRMA_PRICE_2_YEARS). Configurable via env, same STRIPE/EPAYCO_AMOUNT_*_COP
// fallback convention as epayco.service.js. Set at a ~55% markup over
// Viafirma's real IVA-inclusive cost to Ohnix (2026-09-09: confirmed
// $99.008 COP/1yr and $144.704 COP/2yr, both 19% IVA included) - the
// original $100.000/$160.000 figures left almost no margin once Viafirma's
// actual (VAT-inclusive) cost is accounted for. IVA-inclusive totals, same
// as the price customers see - not a separate line item, since ePayco's
// checkout takes one flat amount (see buildCertificateOrderWidgetParams).
const CERTIFICATE_ORDER_AMOUNT_RESOLVER = {
    1: () => Number(process.env.EPAYCO_AMOUNT_CERTIFICATE_1_YEAR_COP || 150000),
    2: () => Number(process.env.EPAYCO_AMOUNT_CERTIFICATE_2_YEARS_COP || 220000),
};

export const getCertificateOrderAmount = (durationYears) => {
    const resolver = CERTIFICATE_ORDER_AMOUNT_RESOLVER[durationYears];
    if (typeof resolver !== "function") return null;
    const amount = resolver();
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
};

// Stored in CertificateOrder.paymentSessionId - same "generated once, reused
// across refreshes" contract as epayco.service.js#generateEpaycoReference.
export const generateCertificateOrderReference = (orderId) => `OHNIX-CERT-${orderId}-${Date.now()}`;

export const buildCertificateOrderWidgetParams = ({ order, user, reference }) => {
    const urls = getCertificateOrderEpaycoUrls();
    const publicKey = `${process.env.EPAYCO_PUBLIC_KEY || ""}`.trim();
    const custId = `${process.env.EPAYCO_P_CUST_ID || ""}`.trim();
    const test = `${process.env.EPAYCO_TEST || "TRUE"}`.trim().toUpperCase() === "TRUE" ? "TRUE" : "FALSE";

    const responseUrlWithId = urls.responseUrl.includes("?")
        ? `${urls.responseUrl}&orderId=${encodeURIComponent(order.id)}`
        : `${urls.responseUrl}?orderId=${encodeURIComponent(order.id)}`;

    return {
        publicKey,
        custId,
        test,
        amount: String(order.amount),
        currency: "COP",
        name: `Certificado de firma digital Viafirma (${order.durationYears} ${order.durationYears === 1 ? "año" : "años"})`,
        description: "Certificado de firma digital para facturación electrónica DIAN - alianza Ohnix/Viafirma",
        email: user.email,
        reference,
        responseUrl: responseUrlWithId,
        confirmationUrl: urls.confirmationUrl,
        // Passed through ePayco as extra fields, returned on confirmation/response
        extra1: order.id, // certificateOrderId - used to activate the entitlement
        extra2: order.companyId,
        extra3: String(order.durationYears),
    };
};

// Re-implemented locally (not imported from epayco.service.js) so this file
// has no dependency on that module's PlanUpgradeRequest-shaped internals -
// the formula itself is provider-level and identical either way.
export const validateCertificateOrderEpaycoSignature = ({ refPayco, transactionId, amount, currencyCode, signature }) => {
    const custId = `${process.env.EPAYCO_P_CUST_ID || ""}`.trim();
    const privateKey = `${process.env.EPAYCO_P_KEY || process.env.EPAYCO_PRIVATE_KEY || ""}`.trim();
    if (!custId || !privateKey || !refPayco || !transactionId || !amount || !currencyCode || !signature) {
        return false;
    }
    const raw = `${custId}^${privateKey}^${refPayco}^${transactionId}^${amount}^${currencyCode}`;
    const computed = crypto.createHash("sha256").update(raw).digest("hex");
    try {
        return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
    } catch {
        return false;
    }
};
