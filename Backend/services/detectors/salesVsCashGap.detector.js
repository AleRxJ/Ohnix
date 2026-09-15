// Mission case 3: "la facturación está creciendo, pero la generación de
// caja está siguiendo una trayectoria diferente" - the time-axis analogue
// of cashIntegrity.service.js's stored-vs-ledger check, but across TIME
// instead of across sources. Compares the trend of billed revenue
// (Order.total) against the trend of cash actually collected against orders
// (CashMovement where sourceType = order_payment) over the same months. A
// widening gap usually means cartera (accounts receivable) is quietly
// absorbing the growth - exactly the kind of thing nobody thinks to go
// looking for on a random Tuesday.
//
// Deliberately conservative (mission rule 5: "no news" is a valid outcome) -
// requires several months of real revenue and a wide enough gap before it
// says anything at all.

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot } from "../metricSnapshot.service.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";

export const DETECTOR_KEY = "sales_vs_cash_gap";

const MONTHS_WINDOW = 6;
const MIN_MONTHS_WITH_DATA = 4;
// A month only counts as "real revenue" above this floor, so a brand-new or
// near-empty account can't produce a "contradiction" out of two invoices and
// rounding noise.
const MIN_MONTHLY_REVENUE = 100000; // COP
const MIN_REVENUE_GROWTH_PCT = 12;
const MIN_GAP_PCT = 20;

const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const monthBounds = (key) => {
    const [y, m] = key.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
};

const lastNMonthKeys = (n, from) => {
    const keys = [];
    for (let i = n - 1; i >= 0; i--) {
        keys.push(monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1))));
    }
    return keys;
};

const bucketByMonth = (rows, dateField, valueFn) => {
    const map = new Map();
    for (const row of rows) {
        const key = monthKey(new Date(row[dateField]));
        map.set(key, (map.get(key) || 0) + valueFn(row));
    }
    return map;
};

const round2 = (n) => Number(n.toFixed(2));
const round1 = (n) => Number(n.toFixed(1));

// First-half-of-window vs second-half-of-window average, rather than a full
// regression - easier to show in the evidence panel ("primeros 3 meses vs.
// últimos 3 meses") and just as informative at a 6-month window.
const halfOverHalfGrowth = (values) => {
    const mid = Math.floor(values.length / 2);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const firstAvg = avg(values.slice(0, mid));
    const secondAvg = avg(values.slice(mid));
    const growthPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : secondAvg > 0 ? 100 : 0;
    return { firstAvg, secondAvg, growthPct };
};

// Pure computation, shared by the detector and by
// discoveryLearning.service.js's later prediction check - the only side
// effect is refreshing MetricSnapshot rows, never a Discovery write.
export const computeSalesVsCashGap = async ({ accountId, db = prisma, now = new Date() }) => {
    const monthKeys = lastNMonthKeys(MONTHS_WINDOW, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);

    const [orders, cashMovements] = await Promise.all([
        db.order.findMany({
            where: { createdById: accountId, orderStatus: { not: "cancelled" }, orderDate: { gte: start, lt: end } },
            select: { orderDate: true, total: true },
        }),
        db.cashMovement.findMany({
            where: {
                delta: { gt: 0 },
                sourceType: "order_payment",
                createdAt: { gte: start, lt: end },
                cashAccount: { createdById: accountId },
            },
            select: { createdAt: true, delta: true },
        }),
    ]);

    const revenueByMonth = bucketByMonth(orders, "orderDate", (o) => Number(o.total));
    const cashByMonth = bucketByMonth(cashMovements, "createdAt", (m) => Number(m.delta));

    const revenueSeries = [];
    const cashSeries = [];
    for (const key of monthKeys) {
        const { start: periodStart, end: periodEnd } = monthBounds(key);
        const revenue = round2(revenueByMonth.get(key) || 0);
        const cash = round2(cashByMonth.get(key) || 0);
        revenueSeries.push({ month: key, value: revenue });
        cashSeries.push({ month: key, value: cash });
        await Promise.all([
            upsertMetricSnapshot({ accountId, entityType: "account", metricKey: "monthly_revenue", periodStart, periodEnd, value: revenue, db }),
            upsertMetricSnapshot({ accountId, entityType: "account", metricKey: "monthly_cash_collected", periodStart, periodEnd, value: cash, db }),
        ]);
    }

    const monthsWithRevenue = revenueSeries.filter((m) => m.value >= MIN_MONTHLY_REVENUE).length;
    const revenueTrend = halfOverHalfGrowth(revenueSeries.map((m) => m.value));
    const cashTrend = halfOverHalfGrowth(cashSeries.map((m) => m.value));
    const gapPct = revenueTrend.growthPct - cashTrend.growthPct;
    const isContradiction = monthsWithRevenue >= MIN_MONTHS_WITH_DATA && revenueTrend.growthPct >= MIN_REVENUE_GROWTH_PCT && gapPct >= MIN_GAP_PCT;

    return { monthKeys, revenueSeries, cashSeries, monthsWithRevenue, revenueTrend, cashTrend, gapPct, isContradiction };
};

export const runSalesVsCashGapDetector = async ({ accountId, db = prisma, now = new Date() }) => {
    const { monthKeys, revenueSeries, cashSeries, monthsWithRevenue, revenueTrend, cashTrend, gapPct, isContradiction } =
        await computeSalesVsCashGap({ accountId, db, now });

    if (monthsWithRevenue < MIN_MONTHS_WITH_DATA) {
        return { discovery: null, created: false, reason: "insufficient_history", monthsWithRevenue };
    }
    if (!isContradiction) {
        return { discovery: null, created: false, reason: "no_significant_gap", revenueTrend, cashTrend, gapPct };
    }

    const confidence = Math.min(0.85, 0.45 + Math.min(gapPct, 100) / 250 + (monthsWithRevenue / MONTHS_WINDOW) * 0.15);
    const impact = Math.min(1, gapPct / 80);
    const urgency = Math.min(1, gapPct / 60);
    const novelty = 0.6;
    const reversibility = 0.55; // a collections/cartera process fix, not structural

    const { discovery, created } = await upsertDiscovery({
        accountId,
        detectorKey: DETECTOR_KEY,
        type: "contradiction",
        dedupeKey: `${DETECTOR_KEY}:account`,
        title: "La facturación está creciendo, pero el efectivo cobrado no la está siguiendo",
        summary: `En los últimos ${MONTHS_WINDOW} meses la facturación creció ${round1(revenueTrend.growthPct)}% (primera mitad del período vs. segunda mitad), pero el efectivo realmente cobrado por esas ventas creció solo ${round1(cashTrend.growthPct)}% en el mismo lapso. Esa brecha de ${round1(gapPct)} puntos porcentuales normalmente significa que la cartera (cuentas por cobrar) está absorbiendo el crecimiento en silencio.`,
        hypothesis: "El crecimiento de ventas se está financiando dando más plazo a los clientes, no con más efectivo entrando - si nada cambia, la brecha entre lo facturado y lo cobrado debería seguir ampliándose.",
        unknowns: "Todavía no sabemos si es una decisión deliberada (plazo para ganar clientes), un problema de cobranza, o clientes concentrados atrasándose - ni cuáles clientes específicos explican la brecha.",
        recommendation: "Revisar el reporte de cartera (AR) para identificar qué clientes concentran el crecimiento del saldo pendiente y si su plazo de pago se ha extendido frente a meses anteriores.",
        scores: { impact, novelty, urgency, confidence, reversibility },
        entityCount: 1,
        patternSince: monthBounds(monthKeys[0]).start,
        evidence: [
            { kind: "metric_series", label: "Facturación mensual (Order.total)", data: revenueSeries, sourceType: "order", sourceId: null },
            { kind: "metric_series", label: "Efectivo cobrado mensual (CashMovement, order_payment)", data: cashSeries, sourceType: "cash_movement", sourceId: null },
            {
                kind: "comparison",
                label: "Crecimiento facturación vs. efectivo cobrado (1ª mitad vs. 2ª mitad del período)",
                data: {
                    revenue_growth_pct: round1(revenueTrend.growthPct),
                    cash_growth_pct: round1(cashTrend.growthPct),
                    gap_pct: round1(gapPct),
                    months_considered: MONTHS_WINDOW,
                    months_with_revenue: monthsWithRevenue,
                },
                sourceType: null,
                sourceId: null,
            },
        ],
        entities: [{ entityType: "cash_flow", entityId: accountId, role: "account_wide", metadata: { months: monthKeys } }],
        predictions: [
            {
                statement: "Si esta brecha continúa, el saldo de cartera pendiente debería seguir creciendo por encima del crecimiento de ventas en los próximos 90 días.",
                predictedData: { expected_direction: "cartera_growth_outpaces_revenue_growth", gap_pct_at_prediction: round1(gapPct) },
                confidenceAtStake: confidence,
                checkAfter: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
            },
        ],
        db,
    });

    return { discovery, created, revenueTrend, cashTrend, gapPct };
};

// Fase 4 learning loop: re-runs the same trend computation as of "now"
// (whatever day checkAfter has arrived) and asks whether the gap the
// prediction described actually persisted. "Correct" is deliberately
// lenient (gap still at least half of what it was) since the prediction
// itself only claimed the gap would "keep widening", not an exact number -
// a gap that shrank a little while staying wide is still the same
// situation continuing, not the prediction failing.
export const checkPrediction = async ({ accountId, prediction, db = prisma, now = new Date() }) => {
    const gapPctAtPrediction = Number(prediction.predictedData?.gap_pct_at_prediction ?? 0);
    const { gapPct: currentGapPct, monthsWithRevenue, revenueTrend, cashTrend } = await computeSalesVsCashGap({ accountId, db, now });

    const actualData = {
        gap_pct_at_prediction: round1(gapPctAtPrediction),
        gap_pct_at_check: round1(currentGapPct),
        revenue_growth_pct_at_check: round1(revenueTrend.growthPct),
        cash_growth_pct_at_check: round1(cashTrend.growthPct),
        months_with_revenue_at_check: monthsWithRevenue,
    };

    if (monthsWithRevenue < MIN_MONTHS_WITH_DATA) {
        return { outcome: "inconclusive", actualData, notes: "No hay suficiente historia de facturación reciente para volver a medir la brecha." };
    }

    if (currentGapPct >= gapPctAtPrediction * 0.5) {
        return { outcome: "correct", actualData, notes: "La brecha entre facturación y efectivo cobrado se mantuvo (o creció) frente al momento de la predicción." };
    }
    if (currentGapPct <= 0) {
        return { outcome: "incorrect", actualData, notes: "El efectivo cobrado se puso al día con la facturación - la brecha desapareció." };
    }
    return { outcome: "inconclusive", actualData, notes: "La brecha se redujo de forma parcial - no es un caso claro de acierto ni de error." };
};
