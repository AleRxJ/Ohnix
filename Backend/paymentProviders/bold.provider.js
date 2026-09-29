import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";

// Bold (bold.co) - in-store payments for the Caja. Every call uses the
// COMPANY'S own Bold account (connection.credentials), never an Ohnix one:
// the money goes straight to each merchant.
//
// credentials: {
//   linkApiKey      - "llave de identidad" of Bold's payment-link/botón
//                     integration (API Link de pagos)
//   terminalApiKey  - "llave de identidad" of Bold's API Integrations
//                     (datáfono), optional - only needed for terminal mode
//   secretKey       - the "llave secreta" Bold signs webhooks with (empty
//                     string in Bold's sandbox)
// }
// config: { userEmail, sandbox }
//
// Docs: https://developers.bold.co/pagos-en-linea/api-link-de-pagos,
// https://developers.bold.co/api-integrations/integration,
// https://www.developers.bold.co/webhook
const BASE_URL = "https://integrations.api.bold.co";
const TIMEOUT_MS = 15000;

const call = async (apiKey, method, path, body) => {
    if (!apiKey) throw new ApiError(400, "Bold API key is not configured for this operation.", [], "", "bold_key_missing");
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                Authorization: `x-api-key ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        throw new ApiError(502, `Bold is unreachable: ${error.message}`, [], "", "bold_unreachable");
    }
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    if (!response.ok) {
        const detail = json?.errors?.map?.((e) => e?.message || e?.detail || JSON.stringify(e)).join("; ") || json?.message || text?.slice(0, 300);
        const status = response.status === 401 || response.status === 403 ? 400 : 502;
        throw new ApiError(status, `Bold rejected the request (${response.status}): ${detail || "no detail"}`, [], "", "bold_request_failed");
    }
    return json;
};

// Bold wants expiration_date in nanoseconds since the epoch.
const nanosFromNow = (minutes) => (BigInt(Date.now() + minutes * 60 * 1000) * 1000000n).toString();

export const boldProvider = {
    key: "bold",

    // Confirms whichever keys were provided actually authenticate. The link
    // API has no read-only endpoint to probe, so a link-only setup is
    // validated by its first real link instead.
    async testConnection(connection) {
        const { terminalApiKey, linkApiKey } = connection.credentials || {};
        if (!terminalApiKey && !linkApiKey) {
            throw new ApiError(400, "Configura al menos una llave de Bold.", [], "", "bold_key_missing");
        }
        if (terminalApiKey) {
            const terminals = await this.listTerminals(connection);
            return { ok: true, detail: `Conexión con Bold verificada (${terminals.length} datáfono(s) vinculados).`, terminals };
        }
        return { ok: true, detail: "Llave de links guardada; se valida con el primer cobro." };
    },

    async listTerminals(connection) {
        const json = await call(connection.credentials?.terminalApiKey, "GET", "/payments/binded-terminals");
        const rows = json?.payload?.available_terminals || json?.payload || json?.data || [];
        return (Array.isArray(rows) ? rows : []).map((t) => ({
            serial: t.terminal_serial,
            model: t.terminal_model,
            name: t.name || t.terminal_serial,
            status: t.status,
        }));
    },

    // Datáfono: pushes the amount to a bound terminal; the result arrives by
    // webhook (reference = intent.reference).
    async createTerminalPayment(connection, { amount, reference, terminalSerial, terminalModel }) {
        const json = await call(connection.credentials?.terminalApiKey, "POST", "/payments/app-checkout", {
            amount: { currency: "COP", total: Number(amount), taxes: [], tip: 0 },
            user_email: connection.config?.userEmail,
            payment_method: "POS",
            terminal_model: terminalModel,
            terminal_serial: terminalSerial,
            reference,
        });
        return { externalId: json?.payload?.integration_id || json?.integration_id || null };
    },

    // Link/QR: a closed-amount checkout the customer opens by scanning.
    async createPaymentLink(connection, { amount, reference, description, expiresInMinutes = 20 }) {
        const json = await call(connection.credentials?.linkApiKey, "POST", "/online/link/v1", {
            amount_type: "CLOSE",
            amount: { currency: "COP", total_amount: Number(amount), tip_amount: 0, taxes: [] },
            reference,
            description: String(description || "Venta").slice(0, 100).padEnd(2, "."),
            expiration_date: nanosFromNow(expiresInMinutes),
        });
        return { externalId: json?.payload?.payment_link || null, checkoutUrl: json?.payload?.url || null };
    },

    // Link status poll - the fallback when the webhook can't reach this
    // server (local dev, a misconfigured dashboard URL). Terminal payments
    // have no documented status endpoint, so they rely on the webhook only.
    async getPaymentLinkStatus(connection, externalId) {
        const json = await call(connection.credentials?.linkApiKey, "GET", `/online/link/v1/${encodeURIComponent(externalId)}`);
        const data = json?.payload || json || {};
        return {
            status: data.status, // ACTIVE | PROCESSING | PAID | REJECTED | CANCELLED | EXPIRED
            total: data.total,
            transactionId: data.transaction_id || null,
        };
    },

    // HMAC-SHA256(base64(rawBody), secretKey) in hex, compared to
    // x-bold-signature. Bold's sandbox signs with an empty secret, so an
    // empty secret is only accepted on a connection explicitly marked sandbox.
    verifyWebhookSignature(rawBody, headers, connection) {
        const signature = headers["x-bold-signature"];
        const secret = connection.credentials?.secretKey ?? "";
        if (!signature || (!secret && !connection.config?.sandbox)) return false;
        const expected = crypto
            .createHmac("sha256", secret)
            .update(Buffer.from(rawBody).toString("base64"))
            .digest("hex");
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(String(signature), "utf8");
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    // Normalizes a Bold webhook into what paymentIntent.service.js acts on.
    parseWebhookEvent(payload) {
        const typeMap = {
            SALE_APPROVED: "approved",
            SALE_REJECTED: "rejected",
            VOID_APPROVED: "voided",
            VOID_REJECTED: "ignored",
        };
        return {
            eventId: payload?.id || null,
            kind: typeMap[payload?.type] || "ignored",
            reference: payload?.data?.metadata?.reference || null,
            providerPaymentId: payload?.data?.payment_id || payload?.subject || null,
            amount: payload?.data?.amount?.total !== undefined ? Number(payload.data.amount.total) : null,
            method: payload?.data?.payment_method || null,
        };
    },
};
