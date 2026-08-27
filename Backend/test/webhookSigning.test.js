import test from "node:test";
import assert from "node:assert/strict";
import { signWebhookPayload, verifyWebhookSignature } from "../utils/webhookSigning.js";

test("signWebhookPayload is deterministic for the same secret+body", () => {
    const a = signWebhookPayload("secret", "{\"a\":1}");
    const b = signWebhookPayload("secret", "{\"a\":1}");
    assert.equal(a, b);
});

test("verifyWebhookSignature accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "order.created", data: { id: "123" } });
    const signature = signWebhookPayload("whsec_test", body);
    assert.equal(verifyWebhookSignature("whsec_test", body, signature), true);
});

test("verifyWebhookSignature rejects a tampered body", () => {
    const body = JSON.stringify({ event: "order.created", data: { id: "123" } });
    const signature = signWebhookPayload("whsec_test", body);
    const tampered = JSON.stringify({ event: "order.created", data: { id: "456" } });
    assert.equal(verifyWebhookSignature("whsec_test", tampered, signature), false);
});

test("verifyWebhookSignature rejects the wrong secret", () => {
    const body = JSON.stringify({ event: "order.created" });
    const signature = signWebhookPayload("whsec_correct", body);
    assert.equal(verifyWebhookSignature("whsec_wrong", body, signature), false);
});

test("verifyWebhookSignature rejects a missing signature", () => {
    assert.equal(verifyWebhookSignature("whsec_test", "{}", undefined), false);
    assert.equal(verifyWebhookSignature("whsec_test", "{}", ""), false);
});

test("verifyWebhookSignature rejects a malformed (non-hex) signature without throwing", () => {
    assert.equal(verifyWebhookSignature("whsec_test", "{}", "not-hex-!!"), false);
});
