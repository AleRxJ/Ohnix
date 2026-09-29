import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { PAYMENT_PROVIDER_KEYS, getPaymentProvider } from "../paymentProviders/registry.js";
import {
    mapPaymentConnection,
    findProviderConnection,
    connectProvider,
    disconnectProvider,
    listProviderTerminals,
    createIntent,
    getIntent,
    cancelIntent,
    mapIntent,
    handleProviderWebhook,
    withProviderCredentials,
} from "../services/paymentIntent.service.js";

const assertProvider = (provider) => {
    if (!PAYMENT_PROVIDER_KEYS.includes(provider)) throw new ApiError(404, "Unknown payment provider.");
};

export const getProviderConnection = asyncHandler(async (req, res) => {
    assertProvider(req.params.provider);
    const connection = await findProviderConnection(req.user.prismaId, req.params.provider);
    return res.status(200).json(new ApiResponse(200, mapPaymentConnection(connection), "Payment provider connection fetched"));
});

export const putProviderConnection = asyncHandler(async (req, res) => {
    assertProvider(req.params.provider);
    const { link_api_key, terminal_api_key, secret_key, user_email, sandbox } = req.body || {};
    const { connection, test } = await connectProvider(req.user.prismaId, req.params.provider, {
        linkApiKey: link_api_key,
        terminalApiKey: terminal_api_key,
        secretKey: secret_key,
        userEmail: user_email,
        sandbox: sandbox === true,
    });
    return res.status(200).json(new ApiResponse(200, { connection: mapPaymentConnection(connection), test }, test.ok ? "Connected" : "Saved, but the test failed"));
});

export const deleteProviderConnection = asyncHandler(async (req, res) => {
    assertProvider(req.params.provider);
    const connection = await disconnectProvider(req.user.prismaId, req.params.provider);
    return res.status(200).json(new ApiResponse(200, mapPaymentConnection(connection), "Disconnected"));
});

export const getProviderTerminals = asyncHandler(async (req, res) => {
    assertProvider(req.params.provider);
    const terminals = await listProviderTerminals(req.user.prismaId, req.params.provider);
    return res.status(200).json(new ApiResponse(200, terminals, "Terminals fetched"));
});

export const postPaymentIntent = asyncHandler(async (req, res) => {
    assertProvider(req.params.provider);
    const { order_id, mode, terminal_serial, terminal_model, cash_account_id, payment_method_id } = req.body || {};
    if (!order_id) throw new ApiError(400, "order_id is required.");
    const intent = await createIntent({
        user: req.user,
        provider: req.params.provider,
        orderId: order_id,
        mode,
        terminalSerial: terminal_serial,
        terminalModel: terminal_model,
        cashAccountId: cash_account_id,
        paymentMethodId: payment_method_id,
    });
    return res.status(201).json(new ApiResponse(201, mapIntent(intent), "Payment intent created"));
});

export const getPaymentIntent = asyncHandler(async (req, res) => {
    const intent = await getIntent({ accountId: req.user.prismaId, intentId: req.params.intentId });
    return res.status(200).json(new ApiResponse(200, mapIntent(intent), "Payment intent fetched"));
});

export const postCancelPaymentIntent = asyncHandler(async (req, res) => {
    const intent = await cancelIntent({ accountId: req.user.prismaId, intentId: req.params.intentId });
    return res.status(200).json(new ApiResponse(200, mapIntent(intent), "Payment intent cancelled"));
});

// Public (no JWT) - mounted with express.raw() in app.js so the signature is
// checked against the exact bytes Bold signed. The connection id in the URL
// scopes everything: its own secret verifies the signature, and a reference
// only resolves among that connection's intents, so one company's webhook
// can never touch another company's sales. Bold needs a 200 within 2s and
// retries otherwise; processing is a couple of indexed queries, so it runs
// before replying - a failure then correctly earns Bold's retry.
export const receiveProviderWebhook = async (req, res) => {
    const { provider, connectionId } = req.params;
    if (!PAYMENT_PROVIDER_KEYS.includes(provider)) return res.status(404).json({ message: "Unknown provider" });

    const row = await prisma.integrationConnection.findFirst({ where: { id: connectionId, provider } });
    if (!row || !row.credentialsEncrypted) return res.status(404).json({ message: "Unknown connection" });

    const connection = withProviderCredentials(row);
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));
    if (!getPaymentProvider(provider).verifyWebhookSignature(rawBody, headers, connection)) {
        return res.status(401).json({ message: "Invalid webhook signature" });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody.toString("utf-8"));
    } catch {
        return res.status(400).json({ message: "Invalid JSON body" });
    }

    try {
        const result = await handleProviderWebhook(connection, payload);
        return res.status(200).json({ received: true, ...result });
    } catch (error) {
        console.error(`[payment-provider] ${provider} webhook failed for connection ${connectionId}`, error);
        return res.status(500).json({ message: "Processing failed" });
    }
};
