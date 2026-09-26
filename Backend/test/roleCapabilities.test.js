import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeCapabilities,
    getCapabilities,
    FULL_CAPABILITIES,
    stripCostFields,
} from "../middleware/team.permissions.js";
import { findLinesBelowFloor, assertSalePricesAllowed } from "../utils/salePriceControl.js";

test("normalizeCapabilities denies missing keys and clamps the discount", () => {
    assert.deepEqual(normalizeCapabilities(undefined), { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false });
    assert.deepEqual(normalizeCapabilities({ salesPriceOverride: "yes", salesMaxDiscountPct: 250, catalogViewCosts: true }), {
        salesPriceOverride: false,
        salesMaxDiscountPct: 100,
        catalogViewCosts: true,
    });
    assert.equal(normalizeCapabilities({ salesMaxDiscountPct: -5 }).salesMaxDiscountPct, 0);
});

test("owner and solo users always get every capability without a DB lookup", async () => {
    assert.deepEqual(await getCapabilities({ isTeamMember: false }), FULL_CAPABILITIES);
    assert.deepEqual(await getCapabilities(null), FULL_CAPABILITIES);
});

test("sale price floor: override passes, discount cap enforced, above list always ok", () => {
    const lines = [
        { listPrice: 1000, effectivePrice: 900, label: "A" },
        { listPrice: 1000, effectivePrice: 1200, label: "B" },
        { listPrice: 1000, effectivePrice: 849.9, label: "C" },
    ];
    assert.deepEqual(findLinesBelowFloor(lines, { salesPriceOverride: true, salesMaxDiscountPct: 0 }), []);
    assert.deepEqual(findLinesBelowFloor(lines, { salesPriceOverride: false, salesMaxDiscountPct: 15 }).map((l) => l.label), ["C"]);
    assert.deepEqual(findLinesBelowFloor(lines, { salesPriceOverride: false, salesMaxDiscountPct: 0 }).map((l) => l.label), ["A", "C"]);
    // Exactly at the floor (within a cent of rounding) is allowed.
    assert.deepEqual(findLinesBelowFloor([{ listPrice: 1000, effectivePrice: 849.995 }], { salesPriceOverride: false, salesMaxDiscountPct: 15 }), []);
    // Products without a list price are never blocked.
    assert.deepEqual(findLinesBelowFloor([{ listPrice: 0, effectivePrice: 0 }], { salesPriceOverride: false, salesMaxDiscountPct: 0 }), []);
});

test("assertSalePricesAllowed throws a 403 with a stable error code", () => {
    assert.throws(
        () => assertSalePricesAllowed([{ listPrice: 100, effectivePrice: 50, label: "Café" }], { salesPriceOverride: false, salesMaxDiscountPct: 10 }),
        (error) => error.statusCode === 403 && error.code === "sale_price_below_allowed" && /10%/.test(error.message)
    );
});

test("stripCostFields removes cost keys at any depth and keeps Decimal/Date-like values whole", () => {
    const decimalLike = { toJSON: () => "12.50", d: [1], e: 1, s: 1 };
    const input = {
        statusCode: 200,
        data: [
            { product_name: "X", buying_price: 10, selling_price: 20, variants: [{ buying_price: 5, sku: "v1" }] },
            { inventoryValue: 99, unitcost: 30, price: decimalLike },
        ],
    };
    const output = stripCostFields(input);
    assert.deepEqual(JSON.parse(JSON.stringify(output)), {
        statusCode: 200,
        data: [
            { product_name: "X", selling_price: 20, variants: [{ sku: "v1" }] },
            // "unitcost" is the sale price on order lines - must survive.
            { unitcost: 30, price: "12.50" },
        ],
    });
});
