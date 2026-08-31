import test from "node:test";
import assert from "node:assert/strict";
import { calculateExpectedReturnedTax } from "../utils/orderReturnTax.js";

test("historical partial returns use the frozen tax rate", () => {
    assert.equal(calculateExpectedReturnedTax({ quantity: 10, returnedQuantity: 3, unitcost: 100, taxRateApplied: 19, taxAmount: 190 }), 57);
});

test("a final return absorbs frozen-tax rounding", () => {
    assert.equal(calculateExpectedReturnedTax({ quantity: 3, returnedQuantity: 3, unitcost: 33.33, taxRateApplied: 19, taxAmount: 19 }), 19);
});

test("historical corruption is clamped to the original frozen tax", () => {
    assert.equal(calculateExpectedReturnedTax({ quantity: 2, returnedQuantity: 3, unitcost: 100, taxRateApplied: 19, taxAmount: 38 }), 38);
});

test("returns on untaxed lines keep returned VAT at zero", () => {
    assert.equal(calculateExpectedReturnedTax({ quantity: 2, returnedQuantity: 1, unitcost: 100, taxRateApplied: 0, taxAmount: 0 }), 0);
});
