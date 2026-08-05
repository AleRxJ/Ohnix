const FACTUS_DEFAULT_TIMEOUT_MS = 20000;

export class FactusError extends Error {
    constructor(message, { status, payload } = {}) {
        super(message);
        this.name = "FactusError";
        this.status = status;
        this.payload = payload;
    }
}

const normalizeUrl = (value) => `${value || ""}`.trim().replace(/\/$/, "");

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        Number(timeoutMs) || FACTUS_DEFAULT_TIMEOUT_MS
    );

    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

// Endpoint paths are verified against the official Factus V2 Postman
// collection (api-factus-v2.json) - do not change these defaults without
// checking that collection first, it is the source of truth, not the
// public docs site (which disagrees with it in places, e.g. credit notes).
const getFactusConfig = () => ({
    baseUrl: normalizeUrl(process.env.FACTUS_BASE_URL || "https://api-sandbox.factus.com.co"),
    authPath: `${process.env.FACTUS_AUTH_PATH || "/oauth/token"}`.trim(),
    invoicePath: `${process.env.FACTUS_INVOICE_PATH || "/v2/bills/validate"}`.trim(),
    invoiceStatusPathTemplate: `${process.env.FACTUS_INVOICE_STATUS_PATH || "/v2/bills/{number}"}`.trim(),
    creditNotePath: `${process.env.FACTUS_CREDIT_NOTE_PATH || "/v2/credit-notes/validate"}`.trim(),
    authMode: `${process.env.FACTUS_AUTH_MODE || "password"}`
        .trim()
        .toLowerCase(),
    clientId: `${process.env.FACTUS_CLIENT_ID || ""}`.trim(),
    clientSecret: `${process.env.FACTUS_CLIENT_SECRET || ""}`.trim(),
    username: `${process.env.FACTUS_USERNAME || ""}`.trim(),
    password: `${process.env.FACTUS_PASSWORD || ""}`.trim(),
    staticToken: `${process.env.FACTUS_ACCESS_TOKEN || ""}`.trim(),
    timeoutMs: Number(process.env.FACTUS_TIMEOUT_MS || FACTUS_DEFAULT_TIMEOUT_MS),
});

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

const buildAuthBody = (config) => {
    const body = new FormData();
    body.set("grant_type", config.authMode === "password" ? "password" : "client_credentials");
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
    if (config.authMode === "password") {
        body.set("username", config.username);
        body.set("password", config.password);
    }
    return body;
};

const getAccessToken = async () => {
    const config = getFactusConfig();

    if (config.staticToken) {
        return config.staticToken;
    }

    if (!config.clientId || !config.clientSecret) {
        throw new Error(
            "Factus credentials are missing. Set FACTUS_CLIENT_ID and FACTUS_CLIENT_SECRET (or FACTUS_ACCESS_TOKEN)."
        );
    }

    if (config.authMode === "password" && (!config.username || !config.password)) {
        throw new Error(
            "Factus password auth requires FACTUS_USERNAME and FACTUS_PASSWORD."
        );
    }

    const body = buildAuthBody(config);

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, config.authPath), {
                method: "POST",
                headers: { Accept: "application/json" },
                body,
                signal,
            }),
        config.timeoutMs
    );

    const payload = await toJsonOrNull(response);

    if (!response.ok) {
        throw new FactusError(
            payload?.message ||
                payload?.error_description ||
                `Factus authentication failed with HTTP ${response.status}`,
            { status: response.status, payload }
        );
    }

    const token =
        payload?.access_token ||
        payload?.token ||
        payload?.data?.access_token ||
        payload?.data?.token;

    if (!token) {
        throw new FactusError("Factus authentication response does not include an access token", { payload });
    }

    return `${token}`;
};

// Every request in the official collection only ever carries Authorization +
// Accept/Content-Type - there is no x-api-key header anywhere in it, so we
// don't send one.
const buildFactusAuthHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
});

export const isFactusConfigured = () => {
    const config = getFactusConfig();
    return Boolean(config.baseUrl && (config.staticToken || (config.clientId && config.clientSecret)));
};

export const createFactusInvoice = async ({ payload }) => {
    const config = getFactusConfig();

    if (!isFactusConfigured()) {
        throw new Error("Factus is not configured");
    }

    const token = await getAccessToken();

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, config.invoicePath), {
                method: "POST",
                headers: buildFactusAuthHeaders(token),
                body: JSON.stringify(payload),
                signal,
            }),
        config.timeoutMs
    );

    const raw = await toJsonOrNull(response);

    if (!response.ok) {
        throw new FactusError(
            raw?.message ||
                raw?.error ||
                `Factus invoice creation failed with HTTP ${response.status}`,
            { status: response.status, payload: raw }
        );
    }

    return raw;
};

export const createFactusCreditNote = async ({ payload }) => {
    const config = getFactusConfig();

    if (!isFactusConfigured()) {
        throw new Error("Factus is not configured");
    }

    const token = await getAccessToken();

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, config.creditNotePath), {
                method: "POST",
                headers: buildFactusAuthHeaders(token),
                body: JSON.stringify(payload),
                signal,
            }),
        config.timeoutMs
    );

    const raw = await toJsonOrNull(response);

    if (!response.ok) {
        throw new FactusError(
            raw?.message ||
                raw?.error ||
                `Factus credit note creation failed with HTTP ${response.status}`,
            { status: response.status, payload: raw }
        );
    }

    return raw;
};

export const getFactusInvoiceStatus = async ({ invoiceNumber }) => {
    const config = getFactusConfig();

    if (!isFactusConfigured()) {
        throw new Error("Factus is not configured");
    }

    if (!invoiceNumber) {
        throw new Error("invoiceNumber is required to query Factus invoice status");
    }

    const token = await getAccessToken();
    const statusPath = config.invoiceStatusPathTemplate.replace("{number}", encodeURIComponent(invoiceNumber));

    const response = await withTimeout(
        (signal) =>
            fetch(buildAbsoluteUrl(config.baseUrl, statusPath), {
                method: "GET",
                headers: buildFactusAuthHeaders(token),
                signal,
            }),
        config.timeoutMs
    );

    const raw = await toJsonOrNull(response);

    if (!response.ok) {
        throw new FactusError(
            raw?.message || raw?.error || `Factus status query failed with HTTP ${response.status}`,
            { status: response.status, payload: raw }
        );
    }

    return raw;
};
