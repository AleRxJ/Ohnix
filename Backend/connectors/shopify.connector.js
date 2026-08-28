import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";

// Quarterly Admin API version string (YYYY-01/04/07/10) - see
// https://shopify.dev/docs/api/usage/versioning. Bump this constant when
// Shopify deprecates the pinned version; nothing else in this file needs
// to change since every request builds its URL from it.
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

const baseUrl = (shopDomain) => `https://${shopDomain}/admin/api/${API_VERSION}`;

const shopifyFetch = async (connection, path, { method = "GET", body } = {}) => {
    const { shopDomain } = connection.config || {};
    const { accessToken } = connection.credentials || {};
    if (!shopDomain || !accessToken) {
        throw new ApiError(400, "This Shopify connection is missing its shop domain or access token");
    }

    const response = await fetch(`${baseUrl(shopDomain)}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = json?.errors ? JSON.stringify(json.errors) : `HTTP ${response.status}`;
        throw new ApiError(502, `Shopify API error: ${message}`);
    }

    return json;
};

// GET /shop.json - the lightest authenticated call available, used purely
// to confirm the access token + shop domain pair actually works.
const testConnection = async (connection) => {
    const data = await shopifyFetch(connection, "/shop.json");
    return { ok: true, detail: `Connected to ${data.shop.name} (${data.shop.myshopify_domain})` };
};

// A custom-app connection has exactly one thing to register: the order
// webhooks it needs to hear about (product/inventory sync stays push-only,
// Ohnix -> Shopify, so no webhook is needed for those). See
// docs/api/webhooks.md for why orders/create + orders/updated +
// orders/cancelled is the minimal useful set - fulfillment/refund nuance
// all arrives as an orders/updated with a changed financial_status.
const ORDER_TOPICS = ["orders/create", "orders/updated", "orders/cancelled"];

const registerWebhooks = async (connection, callbackUrl) => {
    const existing = await shopifyFetch(connection, "/webhooks.json?limit=250");
    const already = new Set((existing.webhooks || []).filter((w) => w.address === callbackUrl).map((w) => w.topic));

    for (const topic of ORDER_TOPICS) {
        if (already.has(topic)) continue;
        await shopifyFetch(connection, "/webhooks.json", {
            method: "POST",
            body: { webhook: { topic, address: callbackUrl, format: "json" } },
        });
    }
};

const resolvePrimaryLocationId = async (connection) => {
    if (connection.config?.locationId) return connection.config.locationId;
    const data = await shopifyFetch(connection, "/locations.json");
    const primary = data.locations?.[0];
    if (!primary) throw new ApiError(502, "This Shopify store has no locations to sync inventory against");
    return primary.id;
};

const toShopifyVariantPayload = (variant, index) => ({
    sku: variant.sku || undefined,
    barcode: variant.barcode || undefined,
    price: String(variant.sellingPrice ?? variant.price),
    option1: variant.optionsLabel || `Default ${index + 1}`,
    inventory_management: "shopify",
});

// Creates the product on first publish, updates it on every later push -
// same "product" JSON body shape for both, Shopify's REST API only differs
// on the HTTP method + whether an id is in the URL. Returns enough of the
// response for the caller to persist ExternalReference rows for the
// product AND each variant (inventory pushes need a variant's
// inventory_item_id, which only exists after this call).
const pushProduct = async (connection, { product, variants, externalId }) => {
    const body = {
        product: {
            title: product.productName,
            body_html: product.description || "",
            vendor: product.brand || undefined,
            status: product.status === "active" ? "active" : "draft",
            images: (product.images || []).map((img) => ({ src: img.url })),
            variants: variants.length > 0
                ? variants.map(toShopifyVariantPayload)
                : [{ sku: product.sku || undefined, barcode: product.barcode || undefined, price: String(product.sellingPrice) }],
        },
    };

    const data = externalId
        ? await shopifyFetch(connection, `/products/${externalId}.json`, { method: "PUT", body })
        : await shopifyFetch(connection, "/products.json", { method: "POST", body });

    const shopifyProduct = data.product;
    const variantExternalIds = {};
    const inventoryMeta = {};
    shopifyProduct.variants.forEach((v, i) => {
        const key = variants[i]?.id || "default";
        variantExternalIds[key] = String(v.id);
        inventoryMeta[key] = { inventoryItemId: String(v.inventory_item_id) };
    });

    return {
        externalId: String(shopifyProduct.id),
        externalUrl: `https://${connection.config.shopDomain.replace(".myshopify.com", "")}.myshopify.com/admin/products/${shopifyProduct.id}`,
        variantExternalIds,
        inventoryMeta,
    };
};

const pushInventory = async (connection, { inventoryItemId, quantity }) => {
    const locationId = await resolvePrimaryLocationId(connection);
    await shopifyFetch(connection, "/inventory_levels/set.json", {
        method: "POST",
        body: { location_id: locationId, inventory_item_id: inventoryItemId, available: Math.max(0, quantity) },
    });
};

// Shopify signs the raw request body with the app's API secret key (shown
// alongside the access token when creating a custom app) using
// HMAC-SHA256, base64-encoded, in the X-Shopify-Hmac-Sha256 header - see
// https://shopify.dev/docs/apps/build/webhooks/subscribe/https. This is a
// different secret AND a different encoding than Ohnix's own outbound
// webhook signing (utils/webhookSigning.js signs hex, over a JSON body
// Ohnix itself constructs) - the two must never be conflated.
const verifyWebhookSignature = (rawBody, headers, connection) => {
    const secret = connection.credentials?.webhookSecret;
    const provided = headers["x-shopify-hmac-sha256"];
    if (!secret || !provided) return false;

    const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    const a = Buffer.from(computed);
    const b = Buffer.from(String(provided));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const STATUS_MAP = {
    pending: "pending",
    paid: "processing",
    partially_paid: "processing",
    refunded: "cancelled",
    voided: "cancelled",
};

// Normalizes a Shopify Order resource (REST Admin API, `orders/create` /
// `orders/updated` webhook payload) into the shape
// integration.service.js#ingestInboundOrder expects. Line items are
// matched back to Ohnix products/variants by ExternalReference lookup on
// their Shopify variant id (see that function) - this only extracts what
// Shopify sent.
const mapInboundOrder = (payload) => ({
    externalOrderId: String(payload.id),
    status: payload.cancelled_at ? "cancelled" : STATUS_MAP[payload.financial_status] || "pending",
    customer: {
        name: [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || payload.email || "Cliente Shopify",
        email: payload.email || payload.customer?.email || null,
        phone: payload.phone || payload.customer?.phone || null,
        address: payload.shipping_address
            ? [payload.shipping_address.address1, payload.shipping_address.city, payload.shipping_address.province]
                  .filter(Boolean)
                  .join(", ")
            : null,
    },
    lineItems: (payload.line_items || []).map((li) => ({
        variantExternalId: li.variant_id ? String(li.variant_id) : null,
        sku: li.sku || null,
        title: li.title,
        quantity: li.quantity,
        unitPrice: Number(li.price),
    })),
    currency: payload.currency,
});

export const shopifyConnector = {
    provider: "shopify",
    testConnection,
    registerWebhooks,
    pushProduct,
    pushInventory,
    verifyWebhookSignature,
    mapInboundOrder,
};
