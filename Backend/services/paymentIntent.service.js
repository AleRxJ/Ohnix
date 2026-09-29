import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { encryptSecret, decryptSecret } from "../utils/secretEncryption.js";
import { getPaymentProvider } from "../paymentProviders/registry.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";
import { getOrderPendingBalance, registerOrderPayment } from "./orderPayment.service.js";

// Caja - charging an order through the company's OWN payment provider
// account (Bold today). Everything here is scoped by accountId: a company
// only ever sees, charges and receives webhooks for its own connection.
//
// Flow (see PaymentIntent's schema comment): the sale already exists ->
// createIntent asks the provider to charge the order's pending balance ->
// the provider's webhook (or a link status poll) resolves it -> on approval
// an OrderPayment is registered as `verified` (source "bold"). Money is
// never taken for a sale that doesn't exist, and a rejected charge leaves an
// ordinary unpaid sale the cashier can retry or collect another way.

const PUBLIC_BASE_URL = (process.env.PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const AMOUNT_TOLERANCE = 1; // COP - rounding on the provider's side
const round2 = (value) => Number(Number(value || 0).toFixed(2));

const withCredentials = (connection) => ({
    ...connection,
    credentials: connection.credentialsEncrypted ? JSON.parse(decryptSecret(connection.credentialsEncrypted)) : {},
});

const mask = (value) => (value ? `••••${String(value).slice(-4)}` : null);

export const webhookUrlFor = (connection) =>
    PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/api/v1/payment-providers/${connection.provider}/webhook/${connection.id}` : null;

// What the Finanzas screen shows - never the keys themselves.
export const mapPaymentConnection = (connection) => {
    if (!connection) return null;
    const creds = withCredentials(connection).credentials;
    return {
        _id: connection.id,
        provider: connection.provider,
        status: connection.status,
        user_email: connection.config?.userEmail || null,
        sandbox: Boolean(connection.config?.sandbox),
        has_link_key: Boolean(creds.linkApiKey),
        has_terminal_key: Boolean(creds.terminalApiKey),
        has_secret_key: Boolean(creds.secretKey),
        link_key_hint: mask(creds.linkApiKey),
        terminal_key_hint: mask(creds.terminalApiKey),
        webhook_url: webhookUrlFor(connection),
        last_error: connection.lastError,
        updatedAt: connection.updatedAt,
    };
};

export const findProviderConnection = (accountId, provider = "bold") =>
    prisma.integrationConnection.findFirst({ where: { accountId, provider }, orderBy: { createdAt: "asc" } });

const requireActiveConnection = async (accountId, provider = "bold") => {
    const connection = await findProviderConnection(accountId, provider);
    if (!connection || connection.status !== "connected") {
        throw new ApiError(400, "Conecta tu cuenta de Bold en Finanzas antes de cobrar con ella.", [], "", "payment_provider_not_connected");
    }
    return withCredentials(connection);
};

// One connection per company and provider. Blank key fields keep whatever is
// already stored, so the owner can rotate one key without re-typing the rest.
export const connectProvider = async (accountId, provider, { linkApiKey, terminalApiKey, secretKey, userEmail, sandbox }) => {
    const impl = getPaymentProvider(provider);
    const existing = await findProviderConnection(accountId, provider);
    const previous = existing ? withCredentials(existing).credentials : {};
    const pick = (next, prev) => (typeof next === "string" && next.trim() ? next.trim() : prev || "");
    const credentials = {
        linkApiKey: pick(linkApiKey, previous.linkApiKey),
        terminalApiKey: pick(terminalApiKey, previous.terminalApiKey),
        // Sandbox signs with "" - a secret is only optional there.
        secretKey: typeof secretKey === "string" && secretKey.trim() ? secretKey.trim() : previous.secretKey || "",
    };
    const config = {
        userEmail: (userEmail || existing?.config?.userEmail || "").trim() || null,
        sandbox: sandbox === true,
    };
    if (credentials.terminalApiKey && !config.userEmail) {
        throw new ApiError(400, "El correo de tu usuario Bold es obligatorio para cobrar en datáfono.", [], "", "bold_user_email_required");
    }
    if (!config.sandbox && !credentials.secretKey) {
        throw new ApiError(400, "La llave secreta de Bold es obligatoria para verificar los pagos.", [], "", "bold_secret_required");
    }

    const data = {
        name: "Bold",
        config,
        credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
    };
    const connection = existing
        ? await prisma.integrationConnection.update({ where: { id: existing.id }, data })
        : await prisma.integrationConnection.create({ data: { ...data, accountId, provider, status: "disconnected" } });

    try {
        const result = await impl.testConnection(withCredentials(connection));
        const saved = await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { status: "connected", lastError: null },
        });
        return { connection: saved, test: result };
    } catch (error) {
        const saved = await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { status: "error", lastError: error.message },
        });
        return { connection: saved, test: { ok: false, detail: error.message } };
    }
};

// Keeps the row (PaymentIntent history points at it) - only forgets the keys.
export const disconnectProvider = async (accountId, provider) => {
    const connection = await findProviderConnection(accountId, provider);
    if (!connection) return null;
    return prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { status: "disconnected", credentialsEncrypted: null, lastError: null },
    });
};

export const listProviderTerminals = async (accountId, provider = "bold") => {
    const connection = await requireActiveConnection(accountId, provider);
    return getPaymentProvider(provider).listTerminals(connection);
};

export const mapIntent = (intent) => ({
    _id: intent.id,
    order_id: intent.orderId,
    mode: intent.mode,
    status: intent.status,
    amount: Number(intent.amount),
    reference: intent.reference,
    checkout_url: intent.checkoutUrl,
    terminal_serial: intent.terminalSerial,
    provider_payment_id: intent.providerPaymentId,
    order_payment_id: intent.orderPaymentId,
    last_error: intent.lastError,
    resolved_at: intent.resolvedAt,
    createdAt: intent.createdAt,
});

// `user` is req.user - used for the POS-scope check on the order.
export const createIntent = async ({ user, orderId, mode, terminalSerial, terminalModel, cashAccountId, paymentMethodId, provider = "bold" }) => {
    const accountId = user.prismaId;
    if (!["terminal", "link"].includes(mode)) throw new ApiError(400, "mode must be terminal or link.", [], "", "payment_intent_mode_invalid");
    if (mode === "terminal" && !terminalSerial) throw new ApiError(400, "Elige el datáfono.", [], "", "payment_intent_terminal_required");
    if (!cashAccountId) throw new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required");

    const connection = await requireActiveConnection(accountId, provider);
    const order = await prisma.order.findFirst({
        where: { OR: [{ id: orderId }, { legacyMongoId: orderId }], createdById: accountId },
        select: { id: true, invoiceNo: true, orderStatus: true, pointOfSaleId: true, currencyCode: true },
    });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    if (user.role !== "admin") assertPosAccess(user, order.pointOfSaleId);
    if (order.orderStatus === "cancelled") throw new ApiError(400, "La venta está anulada.", [], "", "order_payment_order_cancelled");
    if (order.currencyCode !== "COP") throw new ApiError(400, "Bold solo cobra ventas en pesos (COP).", [], "", "payment_intent_currency_unsupported");

    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true }, select: { id: true } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "order_payment_cash_account_not_found");

    // A still-pending attempt for this order is superseded, never left to
    // approve alongside the new one and double-charge the same balance.
    await prisma.paymentIntent.updateMany({
        where: { orderId: order.id, status: "pending" },
        data: { status: "cancelled", resolvedAt: new Date(), lastError: "Reemplazado por un nuevo intento de cobro." },
    });

    const { pending } = await getOrderPendingBalance(order.id);
    const amount = round2(pending);
    if (amount <= 0) throw new ApiError(400, "La venta ya no tiene saldo pendiente.", [], "", "payment_intent_nothing_pending");

    const intent = await prisma.paymentIntent.create({
        data: {
            accountId,
            connectionId: connection.id,
            orderId: order.id,
            mode,
            amount,
            reference: `OHX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
            terminalSerial: mode === "terminal" ? terminalSerial : null,
            terminalModel: mode === "terminal" ? terminalModel || null : null,
            cashAccountId,
            paymentMethodId: paymentMethodId || null,
            createdById: user.actorId,
        },
    });

    const impl = getPaymentProvider(provider);
    try {
        const result =
            mode === "terminal"
                ? await impl.createTerminalPayment(connection, { amount, reference: intent.reference, terminalSerial, terminalModel })
                : await impl.createPaymentLink(connection, { amount, reference: intent.reference, description: `Venta ${order.invoiceNo}` });
        return prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { externalId: result.externalId, checkoutUrl: result.checkoutUrl || null },
        });
    } catch (error) {
        await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "rejected", lastError: error.message, resolvedAt: new Date() },
        });
        throw error;
    }
};

// Single place that turns a provider outcome into Ohnix state - used by the
// webhook and by the link status poll, and safe to call twice for the same
// outcome (each transition claims the row with a status-guarded updateMany).
export const applyProviderOutcome = async (intent, { kind, providerPaymentId, amount, event }) => {
    const now = new Date();
    if (kind === "rejected" || kind === "cancelled" || kind === "expired") {
        await prisma.paymentIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: { status: kind, providerPaymentId: providerPaymentId || undefined, lastEvent: event ?? undefined, resolvedAt: now },
        });
        return;
    }

    if (kind === "voided") {
        const claimed = await prisma.paymentIntent.updateMany({
            where: { id: intent.id, status: { in: ["approved", "needs_review"] } },
            data: { status: "voided", lastEvent: event ?? undefined, resolvedAt: now },
        });
        // The payment's accounting stays as booked - a void is flagged for a
        // person (Pagos por verificar), never silently reversed.
        if (claimed.count && intent.orderPaymentId) {
            await prisma.orderPayment.update({
                where: { id: intent.orderPaymentId },
                data: { verificationStatus: "rejected", verificationSource: "bold", verifiedAt: now, verificationNote: "Anulado en Bold." },
            });
        }
        return;
    }

    if (kind !== "approved") return;

    if (amount !== null && amount !== undefined && Math.abs(Number(amount) - Number(intent.amount)) > AMOUNT_TOLERANCE) {
        await prisma.paymentIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: {
                status: "needs_review",
                providerPaymentId,
                lastEvent: event ?? undefined,
                resolvedAt: now,
                lastError: `Bold aprobó ${amount} pero se pidió ${Number(intent.amount)}.`,
            },
        });
        return;
    }

    const claimed = await prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: "pending" },
        data: { status: "approved", providerPaymentId, lastEvent: event ?? undefined, resolvedAt: now },
    });
    if (!claimed.count) {
        // Cancelled/expired on Ohnix's side, yet the customer still paid on
        // the terminal (or a late webhook for a superseded attempt) - the
        // money is real, so it must reach a person instead of vanishing.
        await prisma.paymentIntent.updateMany({
            where: { id: intent.id, status: { in: ["cancelled", "expired", "rejected"] } },
            data: {
                status: "needs_review",
                providerPaymentId,
                lastEvent: event ?? undefined,
                lastError: "Bold aprobó un cobro que en Ohnix ya estaba cancelado o vencido. Verifica si hay un cobro doble.",
            },
        });
        return;
    }

    try {
        const { pending } = await getOrderPendingBalance(intent.orderId);
        const payment = await registerOrderPayment({
            accountId: intent.accountId,
            actorId: intent.createdById,
            orderId: intent.orderId,
            amount: Math.min(Number(intent.amount), round2(pending)),
            cashAccountId: intent.cashAccountId,
            method: intent.mode === "terminal" ? "Datáfono Bold" : "Bold (link/QR)",
            reference: providerPaymentId || intent.reference,
            settleInFull: false,
            paymentMethodId: intent.paymentMethodId,
            withholdings: {},
            verification: { status: "verified", source: "bold" },
        });
        await prisma.paymentIntent.update({ where: { id: intent.id }, data: { orderPaymentId: payment.id } });
    } catch (error) {
        console.error(`[payment-intent] approved ${intent.id} but could not book the payment`, error);
        await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "needs_review", lastError: `Pago aprobado en Bold, pero no se pudo registrar: ${error.message}` },
        });
    }
};

const LINK_STATUS_TO_KIND = { PAID: "approved", REJECTED: "rejected", CANCELLED: "cancelled", EXPIRED: "expired" };

export const getIntent = async ({ accountId, intentId }) => {
    let intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, accountId } });
    if (!intent) throw new ApiError(404, "Payment intent not found.", [], "", "payment_intent_not_found");

    // Links can also be polled, so a charge still completes if the webhook
    // never arrives (local dev, a wrong URL in the Bold dashboard).
    if (intent.status === "pending" && intent.mode === "link" && intent.externalId) {
        try {
            const connection = await requireActiveConnection(accountId);
            const remote = await getPaymentProvider("bold").getPaymentLinkStatus(connection, intent.externalId);
            const kind = LINK_STATUS_TO_KIND[remote.status];
            if (kind) {
                await applyProviderOutcome(intent, { kind, providerPaymentId: remote.transactionId, amount: remote.total, event: { source: "poll", ...remote } });
                intent = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
            }
        } catch (error) {
            // Polling is best-effort; the webhook is the primary signal.
            console.warn(`[payment-intent] link status poll failed for ${intent.id}:`, error.message);
        }
    }
    return intent;
};

export const cancelIntent = async ({ accountId, intentId }) => {
    const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, accountId } });
    if (!intent) throw new ApiError(404, "Payment intent not found.", [], "", "payment_intent_not_found");
    await prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: "pending" },
        data: { status: "cancelled", resolvedAt: new Date(), lastError: "Cancelado desde la caja." },
    });
    return prisma.paymentIntent.findUnique({ where: { id: intent.id } });
};

// Webhook entry point - `connection` is the one named in the URL, already
// signature-verified, so a reference only ever resolves within it.
export const handleProviderWebhook = async (connection, payload) => {
    const impl = getPaymentProvider(connection.provider);
    const event = impl.parseWebhookEvent(payload);
    if (event.kind === "ignored" || !event.reference) return { handled: false };

    const intent = await prisma.paymentIntent.findFirst({
        where: { reference: event.reference, connectionId: connection.id },
    });
    if (!intent) return { handled: false };

    await applyProviderOutcome(intent, { ...event, event: payload });
    return { handled: true };
};

export { withCredentials as withProviderCredentials };
