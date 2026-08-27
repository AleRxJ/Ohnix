import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../utils/secretEncryption.js";

test("encryptSecret/decryptSecret round-trips a plaintext secret", () => {
    const plaintext = JSON.stringify({ accessToken: "shpat_abc123", webhookSecret: "shpss_def456" });
    const encrypted = encryptSecret(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptSecret(encrypted), plaintext);
});

test("encryptSecret never produces the same ciphertext twice for the same input", () => {
    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    assert.notEqual(a, b); // random IV per call
    assert.equal(decryptSecret(a), "same-plaintext");
    assert.equal(decryptSecret(b), "same-plaintext");
});

test("decryptSecret rejects a tampered ciphertext", () => {
    const encrypted = encryptSecret("hello");
    const tampered = encrypted.slice(0, -4) + "AAAA";
    assert.throws(() => decryptSecret(tampered));
});
