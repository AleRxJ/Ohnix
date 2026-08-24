const ITCYCLE_DEFAULT_TIMEOUT_MS = 20000;

export class ItcycleDianError extends Error {
    constructor(message, { status, payload } = {}) {
        super(message);
        this.name = "ItcycleDianError";
        this.status = status;
        this.payload = payload;
    }
}

const normalizeUrl = (value) => `${value || ""}`.trim().replace(/\/$/, "");

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        Number(timeoutMs) || ITCYCLE_DEFAULT_TIMEOUT_MS
    );

    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

// itcycle-api-dian ("software propio", built by iTCycle alongside Ohnix
// itself) - see itcycle-api-dian/docs/dian/sandbox-tests.md for the full
// endpoint reference this client implements against.
const getItcycleConfig = () => ({
    baseUrl: normalizeUrl(process.env.ITCYCLE_API_URL || "http://localhost:3000"),
    adminApiKey: `${process.env.ITCYCLE_ADMIN_API_KEY || ""}`.trim(),
    timeoutMs: Number(process.env.ITCYCLE_TIMEOUT_MS || ITCYCLE_DEFAULT_TIMEOUT_MS),
});

export const isItcycleConfigured = () => {
    const config = getItcycleConfig();
    return Boolean(config.baseUrl);
};

export const isItcycleAdminConfigured = () => {
    const config = getItcycleConfig();
    return Boolean(config.baseUrl && config.adminApiKey);
};

const toJsonOrNull = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
        const text = await response.text();
        return text ? { raw: text } : null;
    }
    return response.json().catch(() => null);
};

const buildAbsoluteUrl = (baseUrl, path) => `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

const request = async ({ method, path, body, authHeader }) => {
    const config = getItcycleConfig();

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, path), {
                method,
                headers: {
                    ...authHeader,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal,
            }),
        config.timeoutMs
    );

    const raw = await toJsonOrNull(response);

    if (!response.ok) {
        throw new ItcycleDianError(
            raw?.message || raw?.error || `itcycle-api-dian request failed with HTTP ${response.status}`,
            { status: response.status, payload: raw }
        );
    }

    return raw;
};

const requireAdminConfigured = () => {
    if (!isItcycleAdminConfigured()) {
        throw new Error(
            "itcycle-api-dian admin provisioning is not configured. Set ITCYCLE_API_URL and ITCYCLE_ADMIN_API_KEY."
        );
    }
};

const adminAuthHeader = () => ({ "x-admin-api-key": getItcycleConfig().adminApiKey });
const companyAuthHeader = (apiKey) => ({ "x-api-key": apiKey });

// ---------------------------------------------------------------------------
// Provisioning (admin-only, see registerCompanyWithItcycle in
// electronicInvoicing.service.js for the orchestration that calls these in
// order: company -> dian-configuration -> numbering resolutions -> certificate -> api key).
// ---------------------------------------------------------------------------

export const provisionItcycleCompany = async ({ name, nit, dv, personType }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: "/api/v1/admin/companies",
        body: { name, nit, dv, personType },
        authHeader: adminAuthHeader(),
    });
};

export const setItcycleDianConfiguration = async ({ companyId, environment, softwareId, softwarePin, technicalKey, supplierProfile }) => {
    requireAdminConfigured();
    return request({
        method: "PUT",
        path: `/api/v1/admin/companies/${companyId}/dian-configuration`,
        body: { environment, softwareId, softwarePin, technicalKey, supplierProfile },
        authHeader: adminAuthHeader(),
    });
};

export const createItcycleNumberingResolution = async ({ companyId, documentType, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/numbering-resolutions`,
        body: { documentType, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate },
        authHeader: adminAuthHeader(),
    });
};

export const uploadItcycleCertificate = async ({ companyId, provider, certificateIdentifier, p12Base64, password, expiresAt }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/certificates`,
        body: { provider, certificateIdentifier, p12Base64, password, expiresAt },
        authHeader: adminAuthHeader(),
    });
};

export const createItcycleApiKey = async ({ companyId, label }) => {
    requireAdminConfigured();
    const result = await request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/api-keys`,
        body: { label },
        authHeader: adminAuthHeader(),
    });
    return result?.rawKey;
};

// ---------------------------------------------------------------------------
// FirmaPass digital-certificate issuance (admin-only, see
// itcycle-api-dian's src/modules/firmapass/firmaPassIssuance.service.ts).
// Creating the identity validation itself is not automatable (no such
// endpoint exists in FirmaPass's own API) - these calls only automate from
// an already-existing validationUuid onward: rut -> archivos -> confirmar.
// confirmar's response is a one-time snapshot (estado is always "pe" right
// after it) - getItcycleFirmaPassStatus below is the only way to later learn
// the certificate actually went ACTIVE, once itcycle-api-dian's own polling
// job finishes issuance (minutes to hours later, outside Ohnix's control).
// ---------------------------------------------------------------------------

export const setItcycleFirmaPassLoginKey = async ({ companyId, loginKey }) => {
    requireAdminConfigured();
    return request({
        method: "PUT",
        path: `/api/v1/admin/companies/${companyId}/firmapass/login-key`,
        body: { loginKey },
        authHeader: adminAuthHeader(),
    });
};

export const uploadItcycleFirmaPassRut = async ({ companyId, validationUuid, rutBase64, identificacionRepresentanteLegal }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/firmapass/validations/${validationUuid}/rut`,
        body: { rutBase64, identificacionRepresentanteLegal },
        authHeader: adminAuthHeader(),
    });
};

export const uploadItcycleFirmaPassArchivo = async ({ companyId, validationUuid, type, fileBase64 }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/firmapass/validations/${validationUuid}/archivos`,
        body: { type, fileBase64 },
        authHeader: adminAuthHeader(),
    });
};

export const confirmItcycleFirmaPassValidation = async ({ companyId, validationUuid }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/firmapass/validations/${validationUuid}/confirmar`,
        body: {},
        authHeader: adminAuthHeader(),
    });
};

export const getItcycleFirmaPassStatus = async ({ companyId }) => {
    requireAdminConfigured();
    return request({
        method: "GET",
        path: `/api/v1/admin/companies/${companyId}/firmapass/status`,
        authHeader: adminAuthHeader(),
    });
};

// ---------------------------------------------------------------------------
// Documents (per-company API key - see Company.itcycleApiKeyCiphertext).
// ---------------------------------------------------------------------------

export const createItcycleInvoice = async ({ apiKey, internalReference, invoice, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: "/api/v1/documents/invoices",
        body: { internalReference, invoice, send },
        authHeader: companyAuthHeader(apiKey),
    });
};

export const createItcycleCreditNote = async ({ apiKey, internalReference, invoiceId, document, discrepancyResponse, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: "/api/v1/documents/credit-notes",
        body: { internalReference, invoiceId, document, discrepancyResponse, send },
        authHeader: companyAuthHeader(apiKey),
    });
};

export const getItcycleInvoiceStatus = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "GET",
        path: `/api/v1/documents/invoices/${id}`,
        authHeader: companyAuthHeader(apiKey),
    });
};

// GET only ever returns the last stored status - it never re-attempts a send.
// The only thing that actually retries a CONTINGENCY document (one DIAN
// itself was unreachable for, not a validation rejection - see
// itcycle-api-dian's docs/dian/sandbox-tests.md#contingencia) is this POST
// endpoint. Reuses the exact signed XML already delivered to the customer -
// itcycle-api-dian never regenerates it.
export const retryItcycleInvoiceSend = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: `/api/v1/documents/invoices/${id}/retry-send`,
        authHeader: companyAuthHeader(apiKey),
    });
};

export const retryItcycleCreditNoteSend = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: `/api/v1/documents/credit-notes/${id}/retry-send`,
        authHeader: companyAuthHeader(apiKey),
    });
};

// Documento Soporte (DIAN type "05") - self-issued for a purchase from a
// supplier not obligated to invoice. Body field is "document", not
// "invoice" - matches itcycle-api-dian's own CreateSupportDocumentBodySchema.
export const createItcycleSupportDocument = async ({ apiKey, internalReference, document, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: "/api/v1/documents/support-documents",
        body: { internalReference, document, send },
        authHeader: companyAuthHeader(apiKey),
    });
};

export const getItcycleSupportDocumentStatus = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "GET",
        path: `/api/v1/documents/support-documents/${id}`,
        authHeader: companyAuthHeader(apiKey),
    });
};

export const retryItcycleSupportDocumentSend = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: `/api/v1/documents/support-documents/${id}/retry-send`,
        authHeader: companyAuthHeader(apiKey),
    });
};
