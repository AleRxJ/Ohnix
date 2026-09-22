import test from "node:test";
import assert from "node:assert/strict";
import { resolveIsEnglish } from "../services/discoveryLocale.service.js";

test("resolveIsEnglish returns true for an account with preferredLanguage 'en'", async () => {
    const db = { user: { findUnique: async () => ({ preferredLanguage: "en" }) } };
    assert.equal(await resolveIsEnglish({ accountId: "acct_1", db }), true);
});

test("resolveIsEnglish returns false for an account with preferredLanguage 'es'", async () => {
    const db = { user: { findUnique: async () => ({ preferredLanguage: "es" }) } };
    assert.equal(await resolveIsEnglish({ accountId: "acct_1", db }), false);
});

test("resolveIsEnglish defaults to false when the user has no preferredLanguage set", async () => {
    const db = { user: { findUnique: async () => ({ preferredLanguage: null }) } };
    assert.equal(await resolveIsEnglish({ accountId: "acct_1", db }), false);
});

test("resolveIsEnglish defaults to false (never throws) when the db has no user model at all", async () => {
    const db = {};
    assert.equal(await resolveIsEnglish({ accountId: "acct_1", db }), false);
});

test("resolveIsEnglish defaults to false when the lookup itself throws", async () => {
    const db = { user: { findUnique: async () => { throw new Error("connection reset"); } } };
    assert.equal(await resolveIsEnglish({ accountId: "acct_1", db }), false);
});
