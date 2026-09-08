import test from "node:test";
import assert from "node:assert/strict";
import { calculateBudgetPerformance } from "../utils/accountingBudget.js";

test("revenue budget alerts when execution falls below the configured tolerance", () => {
    const result = calculateBudgetPerformance({ accountType: "revenue", budget: 1000, actual: 800, thresholdPercent: 10 });
    assert.equal(result.status, "behind");
    assert.equal(result.alert, true);
    assert.equal(result.variance, -200);
    assert.equal(result.achievement_percent, 80);
});

test("expense budget alerts when actual spending exceeds the tolerance", () => {
    const result = calculateBudgetPerformance({ accountType: "expense", budget: 1000, actual: 1150, thresholdPercent: 10 });
    assert.equal(result.status, "over");
    assert.equal(result.alert, true);
    assert.equal(result.variance_percent, 15);
});

test("favorable revenue and cost execution stays on track", () => {
    assert.equal(calculateBudgetPerformance({ accountType: "revenue", budget: 1000, actual: 1100, thresholdPercent: 10 }).status, "on_track");
    assert.equal(calculateBudgetPerformance({ accountType: "cost", budget: 1000, actual: 900, thresholdPercent: 10 }).status, "on_track");
});

test("spending against a zero budget produces an alert without an invalid percentage", () => {
    const result = calculateBudgetPerformance({ accountType: "cost", budget: 0, actual: 1, thresholdPercent: 10 });
    assert.equal(result.status, "over");
    assert.equal(result.alert, true);
    assert.equal(result.variance_percent, null);
});
