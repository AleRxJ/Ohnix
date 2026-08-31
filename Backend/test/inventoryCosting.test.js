import test from "node:test";
import assert from "node:assert/strict";
import { calculateWeightedAverageCost } from "../services/productLocationStock.service.js";

test("weighted average combines existing value with a purchase receipt", () => {
    assert.deepEqual(
        calculateWeightedAverageCost({ currentQuantity: 10, currentValue: 1000, incomingQuantity: 10, incomingUnitCost: 200 }),
        { quantity: 20, value: 3000, averageUnitCost: 150 }
    );
});

test("weighted average preserves four-decimal unit precision and cent value", () => {
    assert.deepEqual(
        calculateWeightedAverageCost({ currentQuantity: 3, currentValue: 100, incomingQuantity: 2, incomingUnitCost: 40 }),
        { quantity: 5, value: 180, averageUnitCost: 36 }
    );
});

test("first receipt establishes the location cost", () => {
    assert.deepEqual(
        calculateWeightedAverageCost({ currentQuantity: 0, currentValue: 0, incomingQuantity: 3, incomingUnitCost: 12.3456 }),
        { quantity: 3, value: 37.04, averageUnitCost: 12.3467 }
    );
});
