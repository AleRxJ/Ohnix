import test from "node:test";
import assert from "node:assert/strict";
import { checkSeasonalExplanation } from "../services/detectors/customerChurnRisk.detector.js";

const NOW = new Date("2026-09-15T00:00:00Z"); // September, month index 8

// Builds a fake db exposing just order.findMany, returning one order per
// (customerId, year, month) pair in `presentMonths`.
const createFakeOrderDb = (ordersByCustomer) => ({
    order: {
        findMany: async () => {
            const rows = [];
            for (const [customerId, dates] of Object.entries(ordersByCustomer)) {
                for (const date of dates) rows.push({ customerId, orderDate: date });
            }
            return rows;
        },
    },
});

const sept = (year) => new Date(Date.UTC(year, 8, 10));
const march = (year) => new Date(Date.UTC(year, 2, 10));

test("checkSeasonalExplanation supports the claim when most at-risk customers were also quiet this month in prior years", async () => {
    const db = createFakeOrderDb({
        // 3 customers: ordered every March for the last 2 years, but NEVER in September - genuinely seasonal.
        c1: [march(2024), march(2025)],
        c2: [march(2024), march(2025)],
        c3: [march(2024), march(2025)],
        // 2 customers: ordered in September both prior years too - not seasonal for them.
        c4: [sept(2024), sept(2025)],
        c5: [sept(2024), sept(2025)],
    });

    const result = await checkSeasonalExplanation({ accountId: "acct_1", customerIds: ["c1", "c2", "c3", "c4", "c5"], db, now: NOW });
    assert.equal(result.outcome, "supported");
    assert.equal(result.customers_with_history, 5);
    assert.equal(result.support_ratio_pct, 60);
});

test("checkSeasonalExplanation contradicts the claim when most at-risk customers normally DID buy this month historically", async () => {
    const db = createFakeOrderDb({
        c1: [sept(2024), sept(2025)],
        c2: [sept(2024), sept(2025)],
        c3: [sept(2024), sept(2025)],
        c4: [sept(2024), sept(2025)],
        c5: [march(2024), march(2025)], // only this one is genuinely seasonal
    });

    const result = await checkSeasonalExplanation({ accountId: "acct_1", customerIds: ["c1", "c2", "c3", "c4", "c5"], db, now: NOW });
    assert.equal(result.outcome, "contradicted");
    assert.equal(result.support_ratio_pct, 20);
});

test("checkSeasonalExplanation is inconclusive with too few customers carrying multi-year history", async () => {
    const db = createFakeOrderDb({
        c1: [march(2024), march(2025)],
        c2: [sept(2025)], // only 1 prior year (2025 is not < currentYear... actually only order in current year, 0 prior years)
    });

    const result = await checkSeasonalExplanation({ accountId: "acct_1", customerIds: ["c1", "c2"], db, now: NOW });
    assert.equal(result.outcome, "inconclusive");
    assert.ok(result.customers_with_history < 3);
});

test("checkSeasonalExplanation returns inconclusive immediately when no customer ids are given", async () => {
    const db = createFakeOrderDb({});
    const result = await checkSeasonalExplanation({ accountId: "acct_1", customerIds: [], db, now: NOW });
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.customers_with_history, 0);
});

test("checkSeasonalExplanation lands in the ambiguous middle as inconclusive, not forced either way", async () => {
    // 2 of 5 historically quiet this month (40%) - between the 30% and 60% thresholds.
    const db = createFakeOrderDb({
        c1: [march(2024), march(2025)],
        c2: [march(2024), march(2025)],
        c3: [sept(2024), sept(2025)],
        c4: [sept(2024), sept(2025)],
        c5: [sept(2024), sept(2025)],
    });

    const result = await checkSeasonalExplanation({ accountId: "acct_1", customerIds: ["c1", "c2", "c3", "c4", "c5"], db, now: NOW });
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.support_ratio_pct, 40);
});
