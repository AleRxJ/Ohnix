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
// @property {(connection, {product, variants}) => Promise<{externalId, externalUrl, variantExternalIds: Record<string,string>, inventoryMeta: Record<string, {inventoryItemId: string, [extra: string]: any}>}>} pushProduct
//   Creates or updates the product (and its variants) on the channel.
//   inventoryMeta is keyed the same way as variantExternalIds (variant id,
//   or "default" for a variant-less product) - its per-entry object is
//   opaque to the caller (integration.service.js) and stored verbatim as
//   ExternalReference.metadata, then handed back unchanged to pushInventory
//   below. This is deliberately how a connector carries whatever extra
//   handle it needs beyond the channel's own product/variant id (Shopify's
//   inventory_item_id, WooCommerce's parent product id for a variation)
//   without the core ever needing to know which fields exist for which
//   provider.
// @property {(connection, {variantExternalId, quantity, ...inventoryMeta}) => Promise<void>} pushInventory
//   Sets available quantity for one already-published variant. Receives
//   every field from that variant's stored inventoryMeta spread into the
//   options object, plus variantExternalId/quantity.
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
