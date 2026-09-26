import test from "node:test";
import assert from "node:assert/strict";
import { writeReceivableImpairmentRateMetric, METRIC_KEY } from "../services/metrics/receivableImpairmentRate.metric.js";

const NOW = new Date("2026-09-15T00:00:00Z");

const createFakeDb = () => {
    const written = [];
    return {
        metricSnapshot: {
            upsert: async ({ create }) => {
                written.push(create);
                return create;
            },
        },
        _written: written,
    };
};

test("writeReceivableImpairmentRateMetric rates required provision against total outstanding receivables", async () => {
    const db = createFakeDb();
    // Fixed documents regardless of asOfDate - only their bucket (and so the
    // required provision) moves as the cutoff moves; the pending total
    // itself does not, so every one of the 12 months gets written.
    const documents = [
        { pending: 1000, due_date: new Date("2026-06-01T00:00:00Z") }, // ~106 days before NOW -> d91_180 (5%)
        { pending: 500, due_date: new Date("2026-09-10T00:00:00Z") }, // 5 days before NOW -> d1_90 (0%)
    ];
    const loadReceivables = async () => documents;

    const result = await writeReceivableImpairmentRateMetric({ accountId: "acct_1", db, now: NOW, loadReceivables });
    assert.equal(result.monthsWritten, 12);

    const latest = db._written[db._written.length - 1];
    assert.equal(latest.metricKey, METRIC_KEY);
    assert.equal(latest.metadata.totalReceivable, 1500);
    assert.equal(latest.metadata.requiredProvision, 50);
    // 50 / 1500 * 100 = 3.33%
    assert.equal(latest.value, 3.33);
});

test("writeReceivableImpairmentRateMetric skips a month with no receivables outstanding - never writes a fake rate", async () => {
    const db = createFakeDb();
    const loadReceivables = async () => [];

    const result = await writeReceivableImpairmentRateMetric({ accountId: "acct_1", db, now: NOW, loadReceivables });
    assert.equal(result.monthsWritten, 0);
    assert.equal(db._written.length, 0);
});
