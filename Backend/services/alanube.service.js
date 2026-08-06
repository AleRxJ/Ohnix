const ALANUBE_DEFAULT_TIMEOUT_MS = 20000;

export class AlanubeError extends Error {
    constructor(message, { status, payload } = {}) {
        super(message);
        this.name = "AlanubeError";
        this.status = status;
        this.payload = payload;
    }
}

const normalizeUrl = (value) => `${value || ""}`.trim().replace(/\/$/, "");

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        Number(timeoutMs) || ALANUBE_DEFAULT_TIMEOUT_MS
    );

    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

// Alanube is a BaaS layer Alegra runs on top of its own DIAN-authorized
// e-provider API (base URLs literally point at alegra.com) - endpoints and
// schemas below are verified against developer.alanube.co/v1.0-COL as of
// 2026-08. Unlike Factus, auth is a single static Bearer token issued from
// the Alanube dashboard per environment - there is no OAuth token exchange.
const getAlanubeConfig = () => ({
    baseUrl: normalizeUrl(
        process.env.ALANUBE_BASE_URL || "https://sandbox-api.alegra.com/e-provider/col/v1"
    ),
    accessToken: `${process.env.ALANUBE_ACCESS_TOKEN || ""}`.trim(),
    companyPath: `${process.env.ALANUBE_COMPANY_PATH || "/companies"}`.trim(),
    testSetPath: `${process.env.ALANUBE_TEST_SET_PATH || "/test-sets"}`.trim(),
    invoicePath: `${process.env.ALANUBE_INVOICE_PATH || "/invoices"}`.trim(),
    invoiceStatusPathTemplate: `${process.env.ALANUBE_INVOICE_STATUS_PATH || "/invoices/{id}"}`.trim(),
    creditNotePath: `${process.env.ALANUBE_CREDIT_NOTE_PATH || "/credit-notes"}`.trim(),
    resolutionsPathTemplate: `${process.env.ALANUBE_RESOLUTIONS_PATH || "/resolutions/{nit}"}`.trim(),
    timeoutMs: Number(process.env.ALANUBE_TIMEOUT_MS || ALANUBE_DEFAULT_TIMEOUT_MS),
});

export const isAlanubeConfigured = () => {
    const config = getAlanubeConfig();
    return Boolean(config.baseUrl && config.accessToken);
};

const toJsonOrNull = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
        const text = await response.text();
        return text ? { raw: text } : null;
    }
    return response.json().catch(() => null);
};

const buildAbsoluteUrl = (baseUrl, path) =>
    `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

const buildAlanubeHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
});

const requireConfigured = (config) => {
    if (!config.accessToken) {
        throw new Error(
            "Alanube credentials are missing. Set ALANUBE_ACCESS_TOKEN (issued from the Alanube dashboard for the target environment)."
        );
    }
};

const request = async ({ method, path, body }) => {
    const config = getAlanubeConfig();
    requireConfigured(config);

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, path), {
                method,
                headers: buildAlanubeHeaders(config.accessToken),
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal,
            }),
        config.timeoutMs
    );

    const raw = await toJsonOrNull(response);

    if (!response.ok) {
        throw new AlanubeError(
            raw?.message || raw?.error || `Alanube request to ${path} failed with HTTP ${response.status}`,
            { status: response.status, payload: raw }
        );
    }

    return raw;
};

// Step 1 of onboarding a company: registers it with Alanube/Alegra and
// returns the generated company id needed by every later call. See
// https://developer.alanube.co/v1.0-COL/reference/createcompany
export const createAlanubeCompany = ({ payload }) => {
    const config = getAlanubeConfig();
    return request({ method: "POST", path: config.companyPath, body: payload });
};

// Step 2 of onboarding: enables the company for a document type (invoices)
// against DIAN's test set in sandbox, or the real DIAN-issued set id in
// production. Required before that company can emit real documents.
// https://developer.alanube.co/v1.0-COL/reference/createtestset
export const createAlanubeTestSet = ({ companyId, type = "invoices", governmentId }) => {
    const config = getAlanubeConfig();
    return request({
        method: "POST",
        path: config.testSetPath,
        body: { company: { id: companyId }, type, governmentId },
    });
};

// Only enabled in production per Alanube's docs - returns the DIAN-registered
// numbering ranges (resolutions) for a company's NIT so they don't have to be
// entered by hand outside sandbox.
// https://developer.alanube.co/v1.0-COL/reference/getresolutions
export const getAlanubeResolutions = ({ nit }) => {
    const config = getAlanubeConfig();
    if (!nit) throw new Error("nit is required to query Alanube resolutions");
    const path = config.resolutionsPathTemplate.replace("{nit}", encodeURIComponent(nit));
    return request({ method: "GET", path });
};

export const createAlanubeInvoice = ({ payload }) => {
    const config = getAlanubeConfig();
    return request({ method: "POST", path: config.invoicePath, body: payload });
};

export const createAlanubeCreditNote = ({ payload }) => {
    const config = getAlanubeConfig();
    return request({ method: "POST", path: config.creditNotePath, body: payload });
};

export const getAlanubeInvoiceStatus = ({ invoiceId }) => {
    if (!invoiceId) throw new Error("invoiceId is required to query Alanube invoice status");
    const config = getAlanubeConfig();
    const path = config.invoiceStatusPathTemplate.replace("{id}", encodeURIComponent(invoiceId));
    return request({ method: "GET", path });
};
