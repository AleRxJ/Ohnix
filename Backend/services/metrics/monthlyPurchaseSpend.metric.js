// Second proof that trajectoryShift.detector.js's generic MetricSnapshot
// scan covers modules beyond Orders: Purchases (the BUYING side of the
// business - supplier spend, not customer revenue) is tracked nowhere else
// in the Discovery Engine except as an input to supplier_delay_customer_
// connection's own narrow "did this one supplier get slower" question. This
// file reports one number a month - total money paid out to suppliers - and
// trajectoryShift picks it up on its own, same as
// einvoiceRejectionRate.metric.js. See that file's header comment for the
// intended shape any future module's own metric writer should take.

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot, monthKey, monthBounds } from "../metricSnapshot.service.js";

export const METRIC_KEY = "monthly_purchase_spend";
const METRIC_LABEL = "Gasto mensual en compras a proveedores";
const MAX_HISTORY_MONTHS = 36;

const lastNMonthKeys = (n, from) =>
    Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1))));

const round2 = (n) => Number(n.toFixed(2));

export const writeMonthlyPurchaseSpendMetric = async ({ accountId, db = prisma, now = new Date() }) => {
    const monthKeys = lastNMonthKeys(MAX_HISTORY_MONTHS, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);

    // Only "completed" purchases (matches supplierDelayConnection.detector.js's
    // own convention) - a pending purchase order hasn't actually been
    // received/paid yet and a returned one was reversed, neither is real
    // spend for the month it was dated.
    const details = await db.purchaseDetail.findMany({
        where: { purchase: { createdById: accountId, purchaseStatus: "completed", purchaseDate: { gte: start, lt: end } } },
        select: { total: true, purchase: { select: { purchaseDate: true } } },
    });

    const byMonth = new Map();
    for (const detail of details) {
        const key = monthKey(new Date(detail.purchase.purchaseDate));
        byMonth.set(key, (byMonth.get(key) || 0) + Number(detail.total));
    }

    let written = 0;
    for (const key of monthKeys) {
        // No snapshot for a month with zero purchases - could mean the
        // account genuinely bought nothing, or simply didn't exist yet;
        // this file has no way to tell those apart, so (same as
        // einvoiceRejectionRate's convention) it stays silent rather than
        // writing a possibly-fake 0.
        if (!byMonth.has(key)) continue;
        const { start: periodStart, end: periodEnd } = monthBounds(key);
        await upsertMetricSnapshot({
            accountId,
            entityType: "account",
            metricKey: METRIC_KEY,
            periodStart,
            periodEnd,
            value: round2(byMonth.get(key)),
            metadata: { label: METRIC_LABEL },
            db,
        });
        written += 1;
    }

    return { monthsWritten: written };
};
