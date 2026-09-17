import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { woocommerceConnector } from "../connectors/woocommerce.connector.js";

test("mapInboundOrder normalizes a WooCommerce order payload", () => {
    const payload = {
        id: 727,
        status: "processing",
        currency: "COP",
        billing: { first_name: "Ana", last_name: "Gomez", email: "buyer@example.com", phone: "3001234567" },
        shipping: { address_1: "Cra 1 # 2-3", city: "Bogotá", state: "Cundinamarca" },
        line_items: [{ product_id: 55, variation_id: 0, sku: "CAM-001", name: "Camiseta", quantity: 2, price: "50000.00" }],
    };

    const mapped = woocommerceConnector.mapInboundOrder(payload);

    assert.equal(mapped.externalOrderId, "727");
    assert.equal(mapped.status, "completed"); // processing = paid
    assert.equal(mapped.customer.name, "Ana Gomez");
    assert.equal(mapped.lineItems[0].variantExternalId, "55"); // no variation_id -> falls back to product_id
    assert.equal(mapped.lineItems[0].quantity, 2);
    assert.equal(mapped.lineItems[0].unitPrice, 50000);
});

test("mapInboundOrder prefers variation_id over product_id when present", () => {
    const mapped = woocommerceConnector.mapInboundOrder({
        id: 1,
        status: "pending",
        line_items: [{ product_id: 10, variation_id: 99, sku: "X", name: "X", quantity: 1, price: "1000" }],
    });
    assert.equal(mapped.lineItems[0].variantExternalId, "99");
});

test("mapInboundOrder maps cancelled/refunded/failed statuses to cancelled", () => {
    for (const status of ["cancelled", "refunded", "failed", "trash"]) {
        const mapped = woocommerceConnector.mapInboundOrder({ id: 1, status, line_items: [] });
        assert.equal(mapped.status, "cancelled", `status ${status} should map to cancelled`);
    }
});

test("mapInboundOrder maps pending/on-hold to pending", () => {
    assert.equal(woocommerceConnector.mapInboundOrder({ id: 1, status: "pending", line_items: [] }).status, "pending");
    assert.equal(woocommerceConnector.mapInboundOrder({ id: 1, status: "on-hold", line_items: [] }).status, "pending");
});

test("verifyWebhookSignature accepts WooCommerce's base64 HMAC-SHA256 scheme", () => {
    const secret = "wc_webhook_secret";
    const rawBody = Buffer.from(JSON.stringify({ id: 1 }));
    const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

    const connection = { credentials: { webhookSecret: secret } };
    const ok = woocommerceConnector.verifyWebhookSignature(rawBody, { "x-wc-webhook-signature": validSignature }, connection);
    assert.equal(ok, true);
});

test("verifyWebhookSignature rejects a tampered body", () => {
    const secret = "wc_webhook_secret";
    const validSignature = crypto.createHmac("sha256", secret).update(Buffer.from("{}")).digest("base64");
    const connection = { credentials: { webhookSecret: secret } };
    const ok = woocommerceConnector.verifyWebhookSignature(Buffer.from("{\"tampered\":true}"), { "x-wc-webhook-signature": validSignature }, connection);
    assert.equal(ok, false);
});

test("verifyWebhookSignature rejects when no webhook secret is configured", () => {
    const ok = woocommerceConnector.verifyWebhookSignature(Buffer.from("{}"), { "x-wc-webhook-signature": "anything" }, { credentials: {} });
    assert.equal(ok, false);
});
