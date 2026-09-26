// Fourth proof of trajectoryShift.detector.js's generic MetricSnapshot scan:
// receivable aging/impairment (deterioro de cartera). Deliberately does NOT
// read from ReceivableImpairmentRun - that table only gets a row when a
// merchant manually runs the impairment tool (receivableImpairment.service.js
// #runImpairment), which most accounts never do on any regular cadence, so
// it can't back a monthly trend series. Instead this recomputes the same
// aging (loadReceivablesAsOf + computeImpairment, at default fiscal rates)
// independently every month-end, exactly the "found it without being asked"
// point of Discovery Engine - it works even for an account that has never
// opened the impairment screen once.
//
// Rate (required provision / total outstanding receivables), not a raw
// provision amount, same reasoning as every other writer here: comparable
// month to month regardless of how much the business's receivables balance
// itself grew.

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot, monthKey, monthBounds } from "../metricSnapshot.service.js";
import { loadReceivablesAsOf, computeImpairment, DEFAULT_IMPAIRMENT_RATES } from "../receivableImpairment.service.js";

export const METRIC_KEY = "receivable_impairment_rate_pct";
const METRIC_LABEL_ES = "Cartera deteriorada, como % del total por cobrar";
const METRIC_LABEL_EN = "Impaired receivables, as % of total outstanding";
// Every point here needs its own "as of" aging snapshot (loadReceivablesAsOf
// re-fetches every order/payment up to that cutoff) - unlike the other
// writers' single query bucketed by month, this can't be flattened into one
// pass. 12 months (not the usual 36) keeps that cost bounded; trajectoryShift
// only needs MIN_BASELINE_MONTHS(6) + RECENT_MONTHS(3) = 9 to start comparing
// at all, so 12 still leaves a little headroom above the minimum.
const MAX_HISTORY_MONTHS = 12;

const lastNMonthKeys = (n, from) =>
    Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1))));

const round2 = (n) => Number(n.toFixed(2));

// loadReceivables defaults to the real aging query (loadReceivablesAsOf) -
// overridable so tests can exercise this writer's own month-loop/rate/upsert
// logic against canned documents, without also having to fake the several
// other tables (credit notes, write-offs, journal entries) that real aging
// pulls in along the way.
export const writeReceivableImpairmentRateMetric = async ({ accountId, db = prisma, now = new Date(), loadReceivables = loadReceivablesAsOf }) => {
    const monthKeys = lastNMonthKeys(MAX_HISTORY_MONTHS, now);
    let written = 0;

    for (const key of monthKeys) {
        const { start: periodStart, end: periodEnd } = monthBounds(key);
        // The current, still-open month has no real month-end yet - age
        // receivables as of right now instead of a cutoff in the future.
        const asOfDate = periodEnd.getTime() <= now.getTime() ? new Date(periodEnd.getTime() - 1) : now;

        const documents = await loadReceivables(db, accountId, asOfDate);
        const { bucketTotals, required } = computeImpairment({ documents, rates: DEFAULT_IMPAIRMENT_RATES, asOfDate });
        const totalReceivable = round2(Object.values(bucketTotals).reduce((sum, v) => sum + v, 0));
        // No receivables outstanding at all at that month-end - nothing to
        // rate, same "stay silent rather than write a fake number"
        // convention as every other writer here.
        if (totalReceivable <= 0) continue;

        await upsertMetricSnapshot({
            accountId,
            entityType: "account",
            metricKey: METRIC_KEY,
            periodStart,
            periodEnd,
            value: round2((required / totalReceivable) * 100),
            metadata: { label: METRIC_LABEL_ES, labelEn: METRIC_LABEL_EN, requiredProvision: required, totalReceivable },
            db,
        });
        written += 1;
    }

    return { monthsWritten: written };
};
