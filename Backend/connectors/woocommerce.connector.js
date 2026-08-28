import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";

// WooCommerce REST API v3 - https://woocommerce.github.io/woocommerce-rest-api-docs/
// Auth: HTTP Basic Auth over HTTPS, Consumer Key as username / Consumer
// Secret as password (generated in wp-admin: WooCommerce > Settings >
// Advanced > REST API). Unlike Shopify's single access-token header, this
// needs both values together to build the Authorization header.
const API_PATH = "/wp-json/wc/v3";

const normalizeSiteUrl = (siteUrl) => String(siteUrl || "").replace(/\/$/, "");

const authHeader = (consumerKey, consumerSecret) =>
    `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;

const wooFetch = async (connection, path, { method = "GET", body } = {}) => {
    const { siteUrl } = connection.config || {};
    const { consumerKey, consumerSecret } = connection.credentials || {};
    if (!siteUrl || !consumerKey || !consumerSecret) {
        throw new ApiError(400, "This WooCommerce connection is missing its site URL, consumer key or consumer secret");
    }

    const response = await fetch(`${normalizeSiteUrl(siteUrl)}${API_PATH}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader(consumerKey, consumerSecret),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = json?.message || `HTTP ${response.status}`;
        throw new ApiError(502, `WooCommerce API error: ${message}`);
    }

    return json;
};

// GET /products?per_page=1 - the lightest authenticated call: confirms the
// site responds, the REST API is enabled, and the key pair actually works.
const testConnection = async (connection) => {
    await wooFetch(connection, "/products?per_page=1");
    return { ok: true, detail: `Connected to ${normalizeSiteUrl(connection.config.siteUrl)}` };
};

const ORDER_TOPICS = ["order.created", "order.updated", "order.deleted"];

const registerWebhooks = async (connection, callbackUrl) => {
    const existing = await wooFetch(connection, "/webhooks?per_page=100&status=active");
    const already = new Set((existing || []).filter((w) => w.delivery_url === callbackUrl).map((w) => w.topic));

    for (const topic of ORDER_TOPICS) {
        if (already.has(topic)) continue;
        await wooFetch(connection, "/webhooks", {
            method: "POST",
            body: { name: `Ohnix - ${topic}`, topic, delivery_url: callbackUrl, secret: connection.credentials.webhookSecret },
        });
    }
};

const toWooAttributes = (variant) =>
    Object.entries(variant.options || {}).map(([name, option]) => ({ name, option }));

// Variable products (with variations) need the parent product created
// first (type: "variable", with the attribute *definitions*), then each
// variation created against it separately - WooCommerce doesn't accept
// nested variation creation in the same request the way Shopify does.
const pushProduct = async (connection, { product, variants, externalId }) => {
    const isVariable = variants.length > 0;
    const body = {
        name: product.productName,
        description: product.description || "",
        sku: !isVariable ? product.sku || undefined : undefined,
        regular_price: !isVariable ? String(product.sellingPrice) : undefined,
        status: product.status === "active" ? "publish" : "draft",
        images: (product.images || []).map((img) => ({ src: img.url })),
        type: isVariable ? "variable" : "simple",
        manage_stock: !isVariable,
        stock_quantity: !isVariable ? product.stock : undefined,
        attributes: isVariable
            ? Object.keys(variants[0]?.options || {}).map((name) => ({
                  name,
                  variation: true,
                  visible: true,
                  options: [...new Set(variants.map((v) => v.options?.[name]).filter(Boolean))],
              }))
            : undefined,
    };

    const wooProduct = externalId
        ? await wooFetch(connection, `/products/${externalId}`, { method: "PUT", body })
        : await wooFetch(connection, "/products", { method: "POST", body });

    const variantExternalIds = {};
    const inventoryItemIds = {};

    const inventoryMeta = {};

    if (isVariable) {
        for (const variant of variants) {
            const variationBody = {
                sku: variant.sku || undefined,
                regular_price: String(variant.sellingPrice ?? product.sellingPrice),
                manage_stock: true,
                stock_quantity: 0,
                attributes: toWooAttributes(variant),
            };
            const created = await wooFetch(connection, `/products/${wooProduct.id}/variations`, { method: "POST", body: variationBody });
            variantExternalIds[variant.id] = String(created.id);
            // Unlike Shopify's inventory_item_id, WooCommerce has no
            // separate inventory-item concept - the variation id IS the
            // inventory handle, but updating it needs its PARENT product id
            // too (PUT /products/{parent}/variations/{id}), which the id
            // alone doesn't carry - see pushInventory below.
            inventoryMeta[variant.id] = { inventoryItemId: String(created.id), parentProductId: String(wooProduct.id) };
        }
    } else {
        inventoryMeta.default = { inventoryItemId: String(wooProduct.id) };
    }

    return {
        externalId: String(wooProduct.id),
        externalUrl: wooProduct.permalink,
        variantExternalIds,
        inventoryMeta,
    };
};

// `inventoryItemId` is a WooCommerce product id (simple product) or
// variation id (`parentProductId` set - see pushProduct's inventoryMeta
// above); both ultimately PUT the same {manage_stock, stock_quantity}
// shape, only the URL differs.
const pushInventory = async (connection, { inventoryItemId, parentProductId, quantity }) => {
    const path = parentProductId ? `/products/${parentProductId}/variations/${inventoryItemId}` : `/products/${inventoryItemId}`;
    await wooFetch(connection, path, { method: "PUT", body: { manage_stock: true, stock_quantity: Math.max(0, quantity) } });
};

// WooCommerce signs the raw body with the webhook's own secret
// (independent per-webhook, set at registration time - see
// registerWebhooks above), HMAC-SHA256, base64-encoded, in
// X-WC-Webhook-Signature.
const verifyWebhookSignature = (rawBody, headers, connection) => {
    const secret = connection.credentials?.webhookSecret;
    const provided = headers["x-wc-webhook-signature"];
    if (!secret || !provided) return false;

    const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    const a = Buffer.from(computed);
    const b = Buffer.from(String(provided));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

// processing = paid, awaiting fulfillment; completed = paid and fulfilled -
// both mean "the sale happened", which is what should decrement Ohnix
// inventory. on-hold covers manual payment methods (bank transfer, COD
// awaiting confirmation) - not yet a confirmed sale.
const STATUS_MAP = {
    pending: "pending",
    "on-hold": "pending",
    processing: "completed",
    completed: "completed",
    cancelled: "cancelled",
    refunded: "cancelled",
    failed: "cancelled",
    trash: "cancelled",
};

const mapInboundOrder = (payload) => ({
    externalOrderId: String(payload.id),
    status: STATUS_MAP[payload.status] || "pending",
    customer: {
        name: [payload.billing?.first_name, payload.billing?.last_name].filter(Boolean).join(" ") || payload.billing?.email || "Cliente WooCommerce",
        email: payload.billing?.email || null,
        phone: payload.billing?.phone || null,
        address: payload.shipping?.address_1
            ? [payload.shipping.address_1, payload.shipping.city, payload.shipping.state].filter(Boolean).join(", ")
            : null,
    },
    lineItems: (payload.line_items || []).map((li) => ({
        variantExternalId: li.variation_id ? String(li.variation_id) : li.product_id ? String(li.product_id) : null,
        sku: li.sku || null,
        title: li.name,
        quantity: li.quantity,
        unitPrice: Number(li.price ?? (li.total && li.quantity ? li.total / li.quantity : 0)),
    })),
    currency: payload.currency,
});

export const woocommerceConnector = {
    provider: "woocommerce",
    testConnection,
    registerWebhooks,
    pushProduct,
    pushInventory,
    verifyWebhookSignature,
    mapInboundOrder,
};
