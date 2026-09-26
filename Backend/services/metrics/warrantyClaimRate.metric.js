// Third proof of trajectoryShift.detector.js's generic MetricSnapshot scan:
// Warranties (product warranty claims - own model, own lifecycle, nothing
// to do with Orders/CashMovement) never had any Discovery Engine coverage
// at all until this file. Same shape as einvoiceRejectionRate.metric.js -
// see that file's header comment for the intended pattern any future
// module's own metric writer should follow.
//
// Rate (claims / orders that month), not a raw claim count, same reasoning
// as einvoiceRejectionRate/new_pattern_return_rate: comparable month to
// month regardless of how much sales volume grew. A claim is counted in the
// month it was REGISTERED (Warranty.createdAt), not the month of the
// original sale - the same simplification einvoiceRejectionRate and
// new_pattern_return_rate already make (an event this month, against sales
// this month, as a proxy - not a true per-cohort rate).

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot, monthKey, monthBounds } from "../metricSnapshot.service.js";

export const METRIC_KEY = "warranty_claim_rate_pct";
const METRIC_LABEL_ES = "Tasa de reclamos de garantía";
const METRIC_LABEL_EN = "Warranty claim rate";
const MAX_HISTORY_MONTHS = 36;

const lastNMonthKeys = (n, from) =>
    Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1))));

const round2 = (n) => Number(n.toFixed(2));

export const writeWarrantyClaimRateMetric = async ({ accountId, db = prisma, now = new Date() }) => {
    const monthKeys = lastNMonthKeys(MAX_HISTORY_MONTHS, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);

    // Same denominator convention as new_pattern_return_rate.detector.js:
    // only orders that actually happened (completed or returned), not
    // pending/cancelled ones that were never really a sale.
    const [orders, warranties] = await Promise.all([
        db.order.findMany({
            where: { createdById: accountId, orderStatus: { in: ["completed", "returned"] }, orderDate: { gte: start, lt: end } },
            select: { orderDate: true },
        }),
        db.warranty.findMany({
            where: { createdById: accountId, createdAt: { gte: start, lt: end } },
            select: { createdAt: true },
        }),
    ]);

    const ordersByMonth = new Map();
    for (const order of orders) {
        const key = monthKey(new Date(order.orderDate));
        ordersByMonth.set(key, (ordersByMonth.get(key) || 0) + 1);
    }
    const claimsByMonth = new Map();
    for (const warranty of warranties) {
        const key = monthKey(new Date(warranty.createdAt));
        claimsByMonth.set(key, (claimsByMonth.get(key) || 0) + 1);
    }

    let written = 0;
    for (const key of monthKeys) {
        const totalOrders = ordersByMonth.get(key) || 0;
        // No sales that month - a claim rate has no real denominator, same
        // "stay silent rather than write a fake number" convention as every
        // other writer here.
        if (totalOrders === 0) continue;
        const claims = claimsByMonth.get(key) || 0;
        const { start: periodStart, end: periodEnd } = monthBounds(key);
        await upsertMetricSnapshot({
            accountId,
            entityType: "account",
            metricKey: METRIC_KEY,
            periodStart,
            periodEnd,
            value: round2((claims / totalOrders) * 100),
            metadata: { label: METRIC_LABEL_ES, labelEn: METRIC_LABEL_EN, orders: totalOrders, claims },
            db,
        });
        written += 1;
    }

    return { monthsWritten: written };
};
