import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { shopifyConnector } from "../connectors/shopify.connector.js";

test("mapInboundOrder normalizes a Shopify order payload", () => {
    const payload = {
        id: 820982911946154500,
        email: "buyer@example.com",
        phone: null,
        financial_status: "paid",
        cancelled_at: null,
        currency: "COP",
        customer: { first_name: "Ana", last_name: "Gomez", email: "buyer@example.com" },
        shipping_address: { address1: "Cra 1 # 2-3", city: "Bogotá", province: "Cundinamarca" },
        line_items: [
            { variant_id: 111, sku: "CAM-001-NEG-M", title: "Camiseta Negra M", quantity: 2, price: "50000.00" },
        ],
    };

    const mapped = shopifyConnector.mapInboundOrder(payload);

    assert.equal(mapped.externalOrderId, "820982911946154500");
    assert.equal(mapped.status, "processing");
    assert.equal(mapped.customer.name, "Ana Gomez");
    assert.equal(mapped.customer.email, "buyer@example.com");
    assert.equal(mapped.lineItems.length, 1);
    assert.equal(mapped.lineItems[0].variantExternalId, "111");
    assert.equal(mapped.lineItems[0].quantity, 2);
    assert.equal(mapped.lineItems[0].unitPrice, 50000);
});

test("mapInboundOrder marks a cancelled order regardless of financial_status", () => {
    const mapped = shopifyConnector.mapInboundOrder({
        id: 1,
        financial_status: "paid",
        cancelled_at: "2026-08-27T10:00:00Z",
        line_items: [],
    });
    assert.equal(mapped.status, "cancelled");
});

test("mapInboundOrder falls back to a generated name when no customer name is present", () => {
    const mapped = shopifyConnector.mapInboundOrder({ id: 2, email: "x@y.com", line_items: [] });
    assert.equal(mapped.customer.name, "x@y.com");
});

test("verifyWebhookSignature accepts Shopify's base64 HMAC-SHA256 scheme", () => {
    const secret = "shpss_test_secret";
    const rawBody = Buffer.from(JSON.stringify({ id: 1 }));
    const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

    const connection = { credentials: { webhookSecret: secret } };
    const ok = shopifyConnector.verifyWebhookSignature(rawBody, { "x-shopify-hmac-sha256": validSignature }, connection);
    assert.equal(ok, true);
});

test("verifyWebhookSignature rejects a tampered body", () => {
    const secret = "shpss_test_secret";
    const validSignature = crypto.createHmac("sha256", secret).update(Buffer.from("{}")).digest("base64");
    const connection = { credentials: { webhookSecret: secret } };
    const ok = shopifyConnector.verifyWebhookSignature(Buffer.from("{\"tampered\":true}"), { "x-shopify-hmac-sha256": validSignature }, connection);
    assert.equal(ok, false);
});

test("verifyWebhookSignature rejects when no webhook secret is configured", () => {
    const ok = shopifyConnector.verifyWebhookSignature(Buffer.from("{}"), { "x-shopify-hmac-sha256": "anything" }, { credentials: {} });
    assert.equal(ok, false);
});
