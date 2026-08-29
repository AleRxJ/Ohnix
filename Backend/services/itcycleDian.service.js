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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

// itcycle-api-dian's Render free-tier instance sleeps after ~15min idle and
// takes 30-60s to cold-start, during which Render's own edge (not our app
// code) bounces requests with a bare 429 (no JSON body). A short retry
// budget gives up long before the instance finishes waking up, so 429s get a
// much longer retry budget than a plain network failure (wrong host/refused
// connection, which should still fail fast).
const NETWORK_ERROR_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_RETRY_ATTEMPTS = 6;
const MAX_ATTEMPTS = Math.max(NETWORK_ERROR_RETRY_ATTEMPTS, RATE_LIMIT_RETRY_ATTEMPTS);
const RETRY_DELAY_CAP_MS = 15000;

const getRetryDelayMs = (response, attempt) => {
    const retryAfterHeader = response?.headers?.get?.("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return retryAfterSeconds * 1000;
    }
    return Math.min(1000 * 2 ** attempt, RETRY_DELAY_CAP_MS);
};

const request = async ({ method, path, body, authHeader }) => {
    const config = getItcycleConfig();
    const hasBody = body !== undefined;
    let lastError;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        let response;
        try {
            response = await withTimeout(
                (signal) =>
                    fetch(buildAbsoluteUrl(config.baseUrl, path), {
                        method,
                        headers: {
                            ...authHeader,
                            // Only declare a JSON content-type when a body is actually
                            // sent - itcycle-api-dian (Fastify) rejects any request that
                            // carries this header with no body ("Body cannot be empty
                            // when content-type is set to 'application/json'"), which
                            // broke every bodyless POST here: retry-send for
                            // invoices/credit-notes/support-documents and refresh-status.
                            ...(hasBody ? { "Content-Type": "application/json" } : {}),
                            Accept: "application/json",
                        },
                        body: hasBody ? JSON.stringify(body) : undefined,
                        signal,
                    }),
                config.timeoutMs
            );
        } catch (error) {
            lastError = error;
            if (attempt < NETWORK_ERROR_RETRY_ATTEMPTS - 1) {
                await sleep(getRetryDelayMs(null, attempt));
                continue;
            }
            throw error;
        }

        const raw = await toJsonOrNull(response);

        if (!response.ok) {
            lastError = new ItcycleDianError(
                raw?.message || raw?.error || `itcycle-api-dian request failed with HTTP ${response.status}`,
                { status: response.status, payload: raw }
            );

            if (response.status === 429 && attempt < RATE_LIMIT_RETRY_ATTEMPTS - 1) {
                await sleep(getRetryDelayMs(response, attempt));
                continue;
            }

            throw lastError;
        }

        return raw;
    }

    throw lastError || new Error(`itcycle-api-dian request failed for ${path}`);
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
// endpoint exists in FirmaPass's own API) - a client's validation is created
// the moment they buy a certificate on FirmaPass's own site with iTCycle's
// coupon, auto-attached to iTCycle's own FirmaPass "alianza" account (ONE
// shared login key on itcycle-api-dian's side, not a per-company one a
// client would have to hand over - there's no login-key call here anymore).
// These calls automate from an already-discovered validationUuid onward:
// rut -> archivos -> confirmar. confirmar's response is a one-time snapshot
// (estado is always "pe" right after it) - getItcycleFirmaPassStatus below
// is the only way to later learn the certificate actually went ACTIVE, once
// itcycle-api-dian's own polling job finishes issuance (minutes to hours
// later, outside Ohnix's control).
// ---------------------------------------------------------------------------

// Alliance-wide (not scoped to a companyId - matching a discovered
// validation to an Ohnix company is a human/admin judgment call by its
// `nombre` label - unless a real purchase set `owner_email`/`order_number`,
// in which case `orderNumber` below does an exact server-side lookup instead
// of relying on scanning the page). Admin-only.
export const listItcycleFirmaPassValidations = async ({ perPage, orderNumber } = {}) => {
    requireAdminConfigured();
    const query = new URLSearchParams();
    if (perPage) query.set("perPage", String(perPage));
    if (orderNumber) query.set("orderNumber", orderNumber);
    const qs = query.toString();
    return request({
        method: "GET",
        path: `/api/v1/admin/firmapass/validations${qs ? `?${qs}` : ""}`,
        authHeader: adminAuthHeader(),
    });
};

export const getItcycleFirmaPassNuevaSolicitud = async () => {
    requireAdminConfigured();
    return request({
        method: "GET",
        path: "/api/v1/admin/firmapass/validations/nueva-solicitud",
        authHeader: adminAuthHeader(),
    });
};

export const getItcycleFirmaPassValidationDetail = async ({ validationUuid }) => {
    requireAdminConfigured();
    return request({
        method: "GET",
        path: `/api/v1/admin/firmapass/validations/${validationUuid}`,
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

// Read-only readiness projection from itcycle-api-dian. This is deliberately
// separate from FirmaPass status: a valid manual certificate is equally
// capable of signing, and all document types need their own resolution.
export const getItcycleDianReadiness = async ({ companyId }) => {
    requireAdminConfigured();
    return request({
        method: "GET",
        path: `/api/v1/admin/companies/${companyId}/dian-readiness`,
        authHeader: adminAuthHeader(),
    });
};

// Resolves the real DIAN verdict for a document an async send (SendTestSetAsync)
// left in itcycle-api-dian's intermediate "SENT" status - see that repo's
// documentSend.service.ts#computeSentStatusFields and
// admin.service.ts#refreshDocumentStatus for why this exists. `companyId`
// here is itcycle's OWN company id (Company.itcycleCompanyId), matching
// every other admin-* function in this file. Safe to call repeatedly -
// already-terminal documents are returned unchanged, no DIAN call made.
export const refreshItcycleDocumentStatus = async ({ companyId, documentType, id }) => {
    requireAdminConfigured();
    return request({
        method: "POST",
        path: `/api/v1/admin/companies/${companyId}/documents/${documentType}/${id}/refresh-status`,
        authHeader: adminAuthHeader(),
    });
};

// Every invoice/credit-note/debit-note/support-document itcycle-api-dian has
// sent for this company, optionally narrowed to one habilitación round
// (testSetId) - see that repo's admin.service.ts#listTestSubmissions for why
// this doesn't hardcode DIAN's own required-scenarios checklist itself. Lets
// an admin pull "here's everything we've actually submitted under this
// testSetId, and its outcome" to cross-check by hand against DIAN's own
// habilitación portal.
export const listItcycleTestSubmissions = async ({ companyId, testSetId }) => {
    requireAdminConfigured();
    const query = new URLSearchParams();
    if (testSetId) query.set("testSetId", testSetId);
    const qs = query.toString();
    return request({
        method: "GET",
        path: `/api/v1/admin/companies/${companyId}/test-submissions${qs ? `?${qs}` : ""}`,
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

// Mirrors createItcycleCreditNote exactly - itcycle-api-dian's debit-note
// endpoint takes the same body shape (invoiceId + document + discrepancyResponse).
export const createItcycleDebitNote = async ({ apiKey, internalReference, invoiceId, document, discrepancyResponse, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: "/api/v1/documents/debit-notes",
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

export const getItcycleCreditNoteStatus = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "GET",
        path: `/api/v1/documents/credit-notes/${id}`,
        authHeader: companyAuthHeader(apiKey),
    });
};

export const getItcycleDebitNoteStatus = async ({ apiKey, id }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "GET",
        path: `/api/v1/documents/debit-notes/${id}`,
        authHeader: companyAuthHeader(apiKey),
    });
};

// GET only ever returns the last stored status - it never re-attempts a send.
// The only thing that actually retries a CONTINGENCY document (one DIAN
// itself was unreachable for, not a validation rejection - see
// itcycle-api-dian's docs/dian/sandbox-tests.md#contingencia) is this POST
// endpoint. Reuses the exact signed XML already delivered to the customer -
// itcycle-api-dian never regenerates it.
export const retryItcycleInvoiceSend = async ({ apiKey, id, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: `/api/v1/documents/invoices/${id}/retry-send`,
        body: { send },
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

export const retryItcycleSupportDocumentSend = async ({ apiKey, id, send }) => {
    if (!isItcycleConfigured()) throw new Error("itcycle-api-dian is not configured (ITCYCLE_API_URL)");
    return request({
        method: "POST",
        path: `/api/v1/documents/support-documents/${id}/retry-send`,
        body: { send },
        authHeader: companyAuthHeader(apiKey),
    });
};
