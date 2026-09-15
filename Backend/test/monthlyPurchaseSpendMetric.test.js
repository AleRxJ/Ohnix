import test from "node:test";
import assert from "node:assert/strict";
import { writeMonthlyPurchaseSpendMetric, METRIC_KEY } from "../services/metrics/monthlyPurchaseSpend.metric.js";

const NOW = new Date("2026-09-15T00:00:00Z");
const inMonth = (monthsAgo, day = 10) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, day));

const createFakeDb = (details) => {
    const written = [];
    return {
        purchaseDetail: {
            findMany: async ({ where }) => {
                const { purchaseStatus, purchaseDate } = where.purchase;
                return details.filter(
                    (d) => d.purchase.purchaseStatus === purchaseStatus && d.purchase.purchaseDate >= purchaseDate.gte && d.purchase.purchaseDate < purchaseDate.lt
                );
            },
        },
        metricSnapshot: {
            upsert: async ({ create }) => {
                written.push(create);
                return create;
            },
        },
        _written: written,
    };
};

test("writeMonthlyPurchaseSpendMetric sums completed purchase line totals for the month", async () => {
    const details = [
        { total: 500_000, purchase: { purchaseDate: inMonth(1), purchaseStatus: "completed" } },
        { total: 300_000, purchase: { purchaseDate: inMonth(1), purchaseStatus: "completed" } },
        // pending/returned purchases must not count toward real spend.
        { total: 999_999, purchase: { purchaseDate: inMonth(1), purchaseStatus: "pending" } },
    ];
    const db = createFakeDb(details);

    const result = await writeMonthlyPurchaseSpendMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 1);
    assert.equal(db._written[0].metricKey, METRIC_KEY);
    assert.equal(db._written[0].value, 800_000);
});

test("writeMonthlyPurchaseSpendMetric skips a month with no completed purchases - never writes a fake 0", async () => {
    const db = createFakeDb([]);
    const result = await writeMonthlyPurchaseSpendMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 0);
    assert.equal(db._written.length, 0);
});

test("writeMonthlyPurchaseSpendMetric writes one snapshot per month with real activity", async () => {
    const details = [
        { total: 100_000, purchase: { purchaseDate: inMonth(2), purchaseStatus: "completed" } },
        { total: 200_000, purchase: { purchaseDate: inMonth(0), purchaseStatus: "completed" } },
    ];
    const db = createFakeDb(details);
    const result = await writeMonthlyPurchaseSpendMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 2);
});
