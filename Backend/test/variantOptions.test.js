import test from "node:test";
import assert from "node:assert/strict";
import { buildOptionsLabel, validateOptions } from "../services/variant.service.js";
import { ApiError } from "../utils/ApiError.js";

test("buildOptionsLabel joins option values in insertion order", () => {
    assert.equal(buildOptionsLabel({ Color: "Negra", Talla: "M" }), "Negra / M");
    assert.equal(buildOptionsLabel({ Talla: "M", Color: "Negra" }), "M / Negra");
});

test("buildOptionsLabel drops empty/whitespace-only values", () => {
    assert.equal(buildOptionsLabel({ Color: "Negra", Talla: "  " }), "Negra");
});

test("buildOptionsLabel returns an empty string for no options", () => {
    assert.equal(buildOptionsLabel({}), "");
    assert.equal(buildOptionsLabel(undefined), "");
});

test("validateOptions accepts a well-formed options object", () => {
    const options = { Color: "Negra", Talla: "M" };
    assert.deepEqual(validateOptions(options), options);
});

test("validateOptions rejects a non-object", () => {
    assert.throws(() => validateOptions("Negra"), ApiError);
    assert.throws(() => validateOptions(["Negra", "M"]), ApiError);
    assert.throws(() => validateOptions(null), ApiError);
});

test("validateOptions rejects an empty object", () => {
    assert.throws(() => validateOptions({}), ApiError);
});

test("validateOptions rejects a blank option value", () => {
    assert.throws(() => validateOptions({ Color: "  " }), ApiError);
});
