// The first real proof that trajectoryShift.detector.js's "scan whatever
// else is in MetricSnapshot" pass (see that file's header comment) actually
// covers a module OTHER than Orders/CashMovement: DIAN e-invoicing
// (ElectronicInvoice) is a completely different subsystem - own model, own
// provider integrations (itcycle-api-dian/Factus/Alanube), own failure
// modes - and this file never imports anything from the Discovery Engine
// beyond upsertMetricSnapshot. It doesn't know what a Discovery is, doesn't
// register predictions, doesn't pick thresholds - it just reports one
// number a month. trajectoryShift picks it up on its own.
//
// This is the intended shape for any FUTURE module that wants Discovery
// Engine coverage: write a small file like this one (one metricKey, monthly
// cadence, periodStart/periodEnd from metricSnapshot.service.js's
// monthKey/monthBounds so it lines up with every other metric), call it
// from discoveryScheduler.js's METRIC_WRITERS list, and you're done - no
// new detector, no scheduler logic, no schema change.
//
// Rate (not raw count) is the metric on purpose, same reasoning as
// new_pattern_return_rate.detector.js's return rate: a proportion is
// comparable month to month regardless of how much invoicing volume grew,
// a raw rejection count isn't.

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot, monthKey, monthBounds } from "../metricSnapshot.service.js";

export const METRIC_KEY = "einvoice_rejection_rate_pct";
const METRIC_LABEL = "Tasa de rechazo de facturación electrónica (DIAN)";
const MAX_HISTORY_MONTHS = 36;

// Only statuses that actually reached DIAN (or tried to and failed there) -
// draft/issuing are still in flight, cancelled was never really attempted.
const ATTEMPTED_STATUSES = ["submitted", "accepted", "rejected", "error", "contingency"];
const REJECTED_STATUSES = ["rejected", "error"];

const lastNMonthKeys = (n, from) =>
    Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1))));

const round2 = (n) => Number(n.toFixed(2));

export const writeEinvoiceRejectionRateMetric = async ({ accountId, db = prisma, now = new Date() }) => {
    const monthKeys = lastNMonthKeys(MAX_HISTORY_MONTHS, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);

    const invoices = await db.electronicInvoice.findMany({
        where: { status: { in: ATTEMPTED_STATUSES }, createdAt: { gte: start, lt: end }, order: { createdById: accountId } },
        select: { status: true, createdAt: true },
    });

    const byMonth = new Map();
    for (const invoice of invoices) {
        const key = monthKey(new Date(invoice.createdAt));
        const bucket = byMonth.get(key) || { attempted: 0, rejected: 0 };
        bucket.attempted += 1;
        if (REJECTED_STATUSES.includes(invoice.status)) bucket.rejected += 1;
        byMonth.set(key, bucket);
    }

    let written = 0;
    for (const key of monthKeys) {
        const bucket = byMonth.get(key);
        // No snapshot at all for a month with zero attempted invoices - a
        // real 0% rejection month (some attempts, none rejected) is still
        // written, only genuine silence is skipped. See trajectoryShift's
        // "external metrics" pass: a missing month there means "unknown",
        // not "assume zero" - this is the writer half of that contract.
        if (!bucket || bucket.attempted === 0) continue;
        const { start: periodStart, end: periodEnd } = monthBounds(key);
        await upsertMetricSnapshot({
            accountId,
            entityType: "account",
            metricKey: METRIC_KEY,
            periodStart,
            periodEnd,
            value: round2((bucket.rejected / bucket.attempted) * 100),
            metadata: { label: METRIC_LABEL, attempted: bucket.attempted, rejected: bucket.rejected },
            db,
        });
        written += 1;
    }

    return { monthsWritten: written };
};
