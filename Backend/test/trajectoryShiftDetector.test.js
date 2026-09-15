import test from "node:test";
import assert from "node:assert/strict";
import { computeTrajectoryShifts, checkPrediction } from "../services/detectors/trajectoryShift.detector.js";
import { monthKey, monthBounds } from "../services/metricSnapshot.service.js";

const NOW = new Date("2026-09-15T00:00:00Z");

// A fake db good enough to drive both trajectoryShift's own 4 built-in
// metrics (order.findMany/cashMovement.findMany, both empty here so pass 1
// contributes nothing) and its "external metrics" pass, which is the actual
// thing under test - a minimal, generic MetricSnapshot upsert/findMany
// store, exactly the substrate ANY future module's own metric writer would
// use (see services/metrics/einvoiceRejectionRate.metric.js).
const createFakeDb = ({ presetSnapshots = [] } = {}) => {
    const store = new Map();
    const keyOf = (accountId, entityType, entityId, metricKey, periodStart) => `${accountId}|${entityType}|${entityId}|${metricKey}|${periodStart.toISOString()}`;

    for (const row of presetSnapshots) {
        store.set(keyOf(row.accountId, row.entityType, row.entityId ?? "", row.metricKey, row.periodStart), { ...row, entityId: row.entityId ?? "" });
    }

    return {
        order: { findMany: async () => [] },
        cashMovement: { findMany: async () => [] },
        metricSnapshot: {
            upsert: async ({ where, update, create }) => {
                const w = where.accountId_entityType_entityId_metricKey_periodStart;
                const k = keyOf(w.accountId, w.entityType, w.entityId, w.metricKey, w.periodStart);
                const existing = store.get(k);
                const row = existing ? { ...existing, ...update } : { ...create };
                store.set(k, row);
                return row;
            },
            findMany: async ({ where }) => {
                return [...store.values()]
                    .filter((row) => {
                        if (where.accountId && row.accountId !== where.accountId) return false;
                        if (where.entityType && row.entityType !== where.entityType) return false;
                        if (where.metricKey && row.metricKey !== where.metricKey) return false;
                        if (where.periodStart?.gte && row.periodStart < where.periodStart.gte) return false;
                        return true;
                    })
                    .sort((a, b) => a.periodStart - b.periodStart);
            },
        },
    };
};

// Builds `count` monthly snapshot rows ending `monthsAgoForLast` months
// before NOW (0 = the most recent of the window), each `value`.
const buildMonthlySnapshots = ({ accountId, metricKey, label, count, monthsAgoForLast, value }) =>
    Array.from({ length: count }, (_, i) => {
        const monthsAgo = monthsAgoForLast + (count - 1 - i);
        const key = monthKey(new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, 1)));
        const { start, end } = monthBounds(key);
        return { accountId, entityType: "account", metricKey, periodStart: start, periodEnd: end, value, metadata: label ? { label } : null };
    });

test("computeTrajectoryShifts flags a shift in a metric it never wrote itself, using the label another module gave it", async () => {
    const baseline = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "einvoice_rejection_rate_pct", label: "Tasa de rechazo DIAN", count: 8, monthsAgoForLast: 3, value: 5 });
    const recent = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "einvoice_rejection_rate_pct", label: "Tasa de rechazo DIAN", count: 3, monthsAgoForLast: 0, value: 40 });
    const db = createFakeDb({ presetSnapshots: [...baseline, ...recent] });

    const shifts = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW });
    const found = shifts.find((s) => s.metricKey === "einvoice_rejection_rate_pct");
    assert.ok(found, "an external metric with a genuine shift should be flagged");
    assert.equal(found.metricLabel, "Tasa de rechazo DIAN");
    assert.equal(found.direction, "up");
    assert.equal(found.baselineMonths, 8);
});

test("computeTrajectoryShifts falls back to a humanized key when no module provided a label", async () => {
    const baseline = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "some_future_module_metric", count: 8, monthsAgoForLast: 3, value: 100 });
    const recent = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "some_future_module_metric", count: 3, monthsAgoForLast: 0, value: 10 });
    const db = createFakeDb({ presetSnapshots: [...baseline, ...recent] });

    const shifts = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW });
    const found = shifts.find((s) => s.metricKey === "some_future_module_metric");
    assert.ok(found);
    assert.equal(found.metricLabel, "Some future module metric");
    assert.equal(found.direction, "down");
});

test("computeTrajectoryShifts never guesses a shift when the most recent month is missing - silence isn't a shift", async () => {
    const baseline = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "flaky_metric", count: 8, monthsAgoForLast: 3, value: 5 });
    // Only 2 of the 3 truly-recent months report - the module may have
    // simply stopped writing, not shifted.
    const recent = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "flaky_metric", count: 2, monthsAgoForLast: 1, value: 50 });
    const db = createFakeDb({ presetSnapshots: [...baseline, ...recent] });

    const shifts = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW });
    assert.equal(shifts.some((s) => s.metricKey === "flaky_metric"), false);
});

test("computeTrajectoryShifts requires real baseline history before flagging an external metric", async () => {
    // Only 4 baseline months - below MIN_BASELINE_MONTHS (6), even though
    // the recent jump itself is large.
    const baseline = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "young_metric", count: 4, monthsAgoForLast: 3, value: 5 });
    const recent = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "young_metric", count: 3, monthsAgoForLast: 0, value: 50 });
    const db = createFakeDb({ presetSnapshots: [...baseline, ...recent] });

    const shifts = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW });
    assert.equal(shifts.some((s) => s.metricKey === "young_metric"), false);
});

test("computeTrajectoryShifts never double-counts a key it also computes itself (monthly_revenue etc.)", async () => {
    // Even if some other write happened to reuse a built-in metricKey, the
    // external pass must skip it - pass 1 already owns that key.
    const collision = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "monthly_revenue", count: 8, monthsAgoForLast: 3, value: 5 })
        .concat(buildMonthlySnapshots({ accountId: "acct_1", metricKey: "monthly_revenue", count: 3, monthsAgoForLast: 0, value: 500 }));
    const db = createFakeDb({ presetSnapshots: collision });

    const shifts = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW });
    // Pass 1 recomputes monthly_revenue from (empty) orders, finds nothing -
    // the preset rows above must NOT resurrect a duplicate finding via pass 2.
    assert.equal(shifts.filter((s) => s.metricKey === "monthly_revenue").length, 0);
});

test("checkPrediction re-reads MetricSnapshot for an external metric it cannot recompute itself", async () => {
    const recentRows = buildMonthlySnapshots({ accountId: "acct_1", metricKey: "einvoice_rejection_rate_pct", count: 3, monthsAgoForLast: 0, value: 42 });
    const db = createFakeDb({ presetSnapshots: recentRows });

    const prediction = {
        predictedData: { metric_key: "einvoice_rejection_rate_pct", recent_mean_at_prediction: 40, baseline_mean_at_prediction: 5 },
    };
    const result = await checkPrediction({ accountId: "acct_1", prediction, db, now: NOW });
    assert.equal(result.outcome, "correct");
    assert.equal(result.actualData.current_mean, 42);
});

test("checkPrediction reports inconclusive for an external metric that stopped reporting entirely", async () => {
    const db = createFakeDb({ presetSnapshots: [] });
    const prediction = {
        predictedData: { metric_key: "einvoice_rejection_rate_pct", recent_mean_at_prediction: 40, baseline_mean_at_prediction: 5 },
    };
    const result = await checkPrediction({ accountId: "acct_1", prediction, db, now: NOW });
    assert.equal(result.outcome, "inconclusive");
});
