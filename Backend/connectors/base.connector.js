// Contract every e-commerce connector implements (see the "Sistema de
// conectores" section of the integration design). Ohnix's own controllers/
// services (integration.controller.js, the sync engine) only ever call
// through this shape - no connector-specific branching lives outside
// connectors/<provider>.connector.js and connectors/registry.js. Adding a
// second connector (WooCommerce, Mercado Libre, ...) means writing a new
// file that implements this same shape and registering it in registry.js;
// nothing else in the codebase needs to change.
//
// Every method receives `connection` (the IntegrationConnection row, with
// `credentials` already decrypted - see integration.service.js#withCredentials)
// and is expected to:
//   - throw ApiError-like errors for anything the caller should surface to
//     the user (bad credentials, the channel rejected the payload)
//   - never throw for "nothing to do" cases (e.g. pushInventory on a
//     product never published to this channel) - return a no-op result
//     instead, since sync loops call these per-item and one connector
//     hiccup shouldn't be indistinguishable from a hard failure.
//
// @typedef {Object} Connector
// @property {(connection) => Promise<{ok: boolean, detail: string}>} testConnection
//   Verifies the stored credentials still work - what "Probar conexión" in
//   the Integrations UI calls.
// @property {(connection, callbackBaseUrl) => Promise<void>} registerWebhooks
//   Subscribes the channel's own webhooks (order created/updated/cancelled,
//   etc.) to point back at Ohnix's receiver for this connection.
// @property {(connection, {product, variants}) => Promise<{externalId, externalUrl, variantExternalIds: Record<string,string>, inventoryItemIds: Record<string,string>}>} pushProduct
//   Creates or updates the product (and its variants) on the channel.
// @property {(connection, {variantExternalId, inventoryItemId, quantity}) => Promise<void>} pushInventory
//   Sets available quantity for one already-published variant.
// @property {(rawBody: Buffer, headers: Record<string,string>, connection) => boolean} verifyWebhookSignature
//   Confirms an inbound webhook really came from the channel.
// @property {(payload: any) => {externalOrderId: string, status: string, customer: object, lineItems: Array<object>, currency: string, totals: object}} mapInboundOrder
//   Normalizes one channel-native order payload into Ohnix's order shape.
export const CONNECTOR_METHODS = [
    "testConnection",
    "registerWebhooks",
    "pushProduct",
    "pushInventory",
    "verifyWebhookSignature",
    "mapInboundOrder",
];
