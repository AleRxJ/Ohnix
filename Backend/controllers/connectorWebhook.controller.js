import { prisma } from "../db/prisma.js";
import { getConnector, CONNECTOR_PROVIDERS } from "../connectors/registry.js";
import { withDecryptedCredentials, handleInboundOrderEvent } from "../services/integration.service.js";

// Receives an inbound webhook from a connected channel (Shopify order
// events today - see docs/api/webhooks.md). Mounted with express.raw()
// BEFORE the global JSON body parser (see app.js) so req.body is the exact
// Buffer the channel signed - verifying against an already-JSON-parsed and
// re-stringified body would silently break signature verification the
// moment key order or whitespace differs.
//
// Always returns quickly and with a 2xx once the signature/lookup checks
// pass, even if the underlying order ingestion fails - the channel's own
// retry policy (Shopify retries a failing webhook for up to 48h) is not a
// substitute for surfacing errors to the account owner, who sees them in
// SyncLog/the Integrations panel instead.
export const receiveConnectorWebhook = async (req, res) => {
    const { provider, connectionId } = req.params;
    if (!CONNECTOR_PROVIDERS.includes(provider)) {
        return res.status(404).json({ message: "Unknown provider" });
    }

    const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, provider } });
    if (!connection) {
        return res.status(404).json({ message: "Unknown integration connection" });
    }

    const connector = getConnector(provider);
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));

    const connectionWithCreds = withDecryptedCredentials(connection);
    const validSignature = connector.verifyWebhookSignature(rawBody, headers, connectionWithCreds);
    if (!validSignature) {
        return res.status(401).json({ message: "Invalid webhook signature" });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody.toString("utf-8"));
    } catch {
        return res.status(400).json({ message: "Invalid JSON body" });
    }

    // Acknowledge immediately, process after - a slow downstream step (order
    // creation touches tax/accounting/DIAN triggers) shouldn't risk the
    // channel's own webhook delivery timeout turning a real success into a
    // spurious retry.
    res.status(200).json({ received: true });

    handleInboundOrderEvent(connectionWithCreds, payload).catch((error) => {
        console.error(`[integration] failed to process ${provider} webhook for connection ${connectionId}`, error.message);
    });
};
