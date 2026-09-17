import test from "node:test";
import assert from "node:assert/strict";
import { API_SCOPES, FULL_ACCESS_SCOPES, isValidScope } from "../utils/apiScopes.js";

test("isValidScope accepts every declared scope", () => {
    for (const scope of API_SCOPES) {
        assert.equal(isValidScope(scope), true);
    }
});

test("isValidScope rejects an unknown scope", () => {
    assert.equal(isValidScope("products:delete"), false);
    assert.equal(isValidScope(""), false);
    assert.equal(isValidScope("products"), false);
});

test("FULL_ACCESS_SCOPES contains every scope exactly once", () => {
    assert.equal(FULL_ACCESS_SCOPES.length, API_SCOPES.length);
    assert.equal(new Set(FULL_ACCESS_SCOPES).size, API_SCOPES.length);
});
