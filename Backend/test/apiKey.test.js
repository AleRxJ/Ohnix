import test from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";

test("generateApiKey returns a key whose prefix is embedded in the full key", () => {
    const { fullKey, keyPrefix } = generateApiKey();
    assert.ok(fullKey.startsWith(`${keyPrefix}_`));
    assert.ok(keyPrefix.startsWith("ohx_"));
});

test("generateApiKey's stored hash matches hashing the full key again", () => {
    const { fullKey, keyHash } = generateApiKey();
    assert.equal(hashApiKey(fullKey), keyHash);
});

test("generateApiKey never returns the same key twice", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    assert.notEqual(a.fullKey, b.fullKey);
    assert.notEqual(a.keyHash, b.keyHash);
});

test("hashApiKey is order/case sensitive (different input -> different hash)", () => {
    assert.notEqual(hashApiKey("ohx_abc_123"), hashApiKey("ohx_abc_124"));
});
