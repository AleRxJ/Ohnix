import test from "node:test";
import assert from "node:assert/strict";
import { amortizedTarget, computeAmortizationDue } from "../services/prepaidExpense.service.js";

const policy = { totalAmount: 1000000, months: 12, startPeriod: "2026-07", monthsAmortized: 0 };

test("diferidos: straight line, last month trues up the rounding", () => {
    assert.equal(amortizedTarget(policy, 1), 83333.33);
    assert.equal(amortizedTarget(policy, 11), 916666.63);
    assert.equal(amortizedTarget(policy, 12), 1000000);
    assert.equal(amortizedTarget(policy, 20), 1000000);
    assert.equal(amortizedTarget(policy, 0), 0);
});

test("diferidos: a past start catches up every month due in one run", () => {
    const due = computeAmortizationDue(policy, "2026-09");
    assert.deepEqual(due, { dueMonths: 3, pendingMonths: 3, amount: 249999.99, fromPeriod: "2026-07", toPeriod: "2026-09" });
    const next = computeAmortizationDue({ ...policy, monthsAmortized: 3 }, "2026-10");
    assert.deepEqual(next, { dueMonths: 4, pendingMonths: 1, amount: 83333.33, fromPeriod: "2026-10", toPeriod: "2026-10" });
});

test("diferidos: nothing due before the start, capped at the term, crosses the year", () => {
    assert.equal(computeAmortizationDue(policy, "2026-06").pendingMonths, 0);
    const last = computeAmortizationDue({ ...policy, monthsAmortized: 11 }, "2027-06");
    assert.deepEqual(last, { dueMonths: 12, pendingMonths: 1, amount: 83333.37, fromPeriod: "2027-06", toPeriod: "2027-06" });
    assert.equal(computeAmortizationDue({ ...policy, monthsAmortized: 12 }, "2028-01").pendingMonths, 0);
    const sum = amortizedTarget(policy, 11) + last.amount;
    assert.equal(Math.round(sum * 100), 100000000);
});
