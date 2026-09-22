// Mission case F ("cambios de trayectoria") / case D ("patrones nuevos"):
// "Durante los últimos 90 días tu empresa empezó a comportarse de una
// forma que no había aparecido durante los últimos tres años."
//
// Two passes:
//   1. Its own 4 built-in metrics (revenue, order count, active customers,
//      cash collected) - computed directly from Order/CashMovement, exactly
//      as before.
//   2. EVERY OTHER metricKey present in MetricSnapshot for this account -
//      read-only, no idea how any of them are computed. This is what makes
//      the detector genuinely self-extending: when a future Ohnix module
//      wants Discovery Engine coverage, it doesn't touch this file, the
//      scheduler, or any detector - it just calls upsertMetricSnapshot with
//      its own metricKey once a month (see metricSnapshot.service.js's
//      monthKey/monthBounds contract), and the NEXT nightly run already
//      scans it for a shift. See services/metrics/einvoiceRejectionRate.metric.js
//      for the first real example of a non-Order module doing exactly that.
//
// Statistically conservative on purpose: requires real history to compare
// against (a young account, or a metric a module only recently started
// reporting, has no "before" to shift away from) AND a change large enough
// in both z-score and plain relative-magnitude terms - a statistically
// "significant" 2% wobble on a stable metric isn't a story. For pass 2,
// "real history" additionally means every one of the RECENT_MONTHS months
// must actually have a snapshot - a metric that simply stopped reporting
// recently is silence, not a trajectory shift, and this never guesses which
// one it is.

import { prisma } from "../../db/prisma.js";
import { upsertMetricSnapshot, monthKey, monthBounds } from "../metricSnapshot.service.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";
import { resolveIsEnglish } from "../discoveryLocale.service.js";

export const DETECTOR_KEY = "trajectory_shift";

const RECENT_MONTHS = 3;
const MAX_HISTORY_MONTHS = 36;
const MIN_BASELINE_MONTHS = 6;
const SHIFT_Z_THRESHOLD = 2.0;
const MIN_RELATIVE_CHANGE = 0.3;

const lastNMonthKeys = (n, from) =>
    Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1))));

const round2 = (n) => Number(n.toFixed(2));
const round1 = (n) => Number(n.toFixed(1));

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const stdDev = (arr, avg) => (arr.length ? Math.sqrt(arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length) : 0);

// Shared by both passes: given a baseline sample and a recent sample of the
// SAME metric, decide whether the recent level is a real shift - returns
// null when it isn't (either not different enough, or not measured
// precisely enough given the sample size).
const evaluateShift = (baselineValues, recentValues) => {
    const baselineMean = mean(baselineValues);
    const baselineStd = stdDev(baselineValues, baselineMean);
    const recentMean = mean(recentValues);
    const floor = Math.max(baselineStd, baselineMean * 0.1, 1);
    const z = (recentMean - baselineMean) / floor;
    const relativeChange = baselineMean > 0 ? (recentMean - baselineMean) / baselineMean : recentMean > 0 ? 1 : 0;

    if (Math.abs(z) < SHIFT_Z_THRESHOLD || Math.abs(relativeChange) < MIN_RELATIVE_CHANGE) return null;

    return { baselineMean, baselineStd, recentMean, z, relativeChange, direction: recentMean >= baselineMean ? "up" : "down" };
};

// Each metric here is self-contained: its own aggregation over Order/
// CashMovement, independent of any other detector's own MetricSnapshot
// writes, so this detector never depends on run order within a tick.
// `label` is a function of isEN (not a static string) for the same reason
// new_pattern_return_rate.detector.js's DIMENSIONS became one - it ends up
// embedded in the title/summary text the account's own preferredLanguage
// should control.
const buildMetrics = (isEN) => [
    {
        key: "monthly_revenue",
        label: isEN ? "Monthly revenue" : "Facturación mensual",
        compute: async (db, accountId, start, end) => {
            const orders = await db.order.findMany({ where: { createdById: accountId, orderStatus: { not: "cancelled" }, orderDate: { gte: start, lt: end } }, select: { orderDate: true, total: true } });
            return bucketSum(orders, "orderDate", (o) => Number(o.total));
        },
    },
    {
        key: "monthly_order_count",
        label: isEN ? "Monthly order count" : "Número de pedidos mensuales",
        compute: async (db, accountId, start, end) => {
            const orders = await db.order.findMany({ where: { createdById: accountId, orderStatus: { not: "cancelled" }, orderDate: { gte: start, lt: end } }, select: { orderDate: true } });
            return bucketSum(orders, "orderDate", () => 1);
        },
    },
    {
        key: "monthly_active_customers",
        label: isEN ? "Unique customers who bought per month" : "Clientes únicos que compraron por mes",
        compute: async (db, accountId, start, end) => {
            const orders = await db.order.findMany({ where: { createdById: accountId, orderStatus: { not: "cancelled" }, orderDate: { gte: start, lt: end } }, select: { orderDate: true, customerId: true } });
            const byMonth = new Map();
            for (const o of orders) {
                const key = monthKey(new Date(o.orderDate));
                const set = byMonth.get(key) || new Set();
                set.add(o.customerId);
                byMonth.set(key, set);
            }
            return new Map([...byMonth.entries()].map(([k, set]) => [k, set.size]));
        },
    },
    {
        key: "monthly_cash_collected",
        label: isEN ? "Monthly cash collected" : "Efectivo cobrado mensual",
        compute: async (db, accountId, start, end) => {
            const movements = await db.cashMovement.findMany({
                where: { delta: { gt: 0 }, sourceType: "order_payment", createdAt: { gte: start, lt: end }, cashAccount: { createdById: accountId } },
                select: { createdAt: true, delta: true },
            });
            return bucketSum(movements, "createdAt", (m) => Number(m.delta));
        },
    },
];
const BUILT_IN_KEYS = new Set(buildMetrics(false).map((m) => m.key));

const bucketSum = (rows, dateField, valueFn) => {
    const map = new Map();
    for (const row of rows) {
        const key = monthKey(new Date(row[dateField]));
        map.set(key, (map.get(key) || 0) + valueFn(row));
    }
    return map;
};

// Humanizes a metricKey nobody gave a nicer label to - same fallback idiom
// as the frontend's labelForEvidenceKey (discoveryMeta.js), so an
// unlabeled external metric still reads as words, not a raw snake_case key.
const humanizeKey = (key) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const computeTrajectoryShifts = async ({ accountId, db = prisma, now = new Date(), isEN = false }) => {
    const METRICS = buildMetrics(isEN);
    const monthKeys = lastNMonthKeys(MAX_HISTORY_MONTHS, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);
    const baselineKeys = monthKeys.slice(0, -RECENT_MONTHS);
    const recentKeys = monthKeys.slice(-RECENT_MONTHS);

    const shifts = [];

    // Pass 1: the 4 metrics this file itself knows how to compute.
    for (const metric of METRICS) {
        const byMonth = await metric.compute(db, accountId, start, end);

        const series = monthKeys.map((key) => {
            const { start: periodStart, end: periodEnd } = monthBounds(key);
            return { month: key, value: round2(byMonth.get(key) || 0), periodStart, periodEnd };
        });
        for (const point of series) {
            await upsertMetricSnapshot({ accountId, entityType: "account", metricKey: metric.key, periodStart: point.periodStart, periodEnd: point.periodEnd, value: point.value, db });
        }

        // A month only "counts" toward baseline history if it has at least
        // one month before it with real activity - an all-zero prefix (the
        // account simply didn't exist yet) shouldn't inflate how much
        // history we claim to have compared against.
        const baselineValues = series.slice(0, baselineKeys.length).map((p) => p.value);
        const firstActiveIndex = baselineValues.findIndex((v) => v > 0);
        const trimmedBaseline = firstActiveIndex === -1 ? [] : baselineValues.slice(firstActiveIndex);
        if (trimmedBaseline.length < MIN_BASELINE_MONTHS) continue;

        const recentValues = series.slice(-RECENT_MONTHS).map((p) => p.value);
        const shift = evaluateShift(trimmedBaseline, recentValues);
        if (!shift) continue;

        shifts.push({ metricKey: metric.key, metricLabel: metric.label, series, baselineMonths: trimmedBaseline.length, ...shift });
    }

    // Pass 2: whatever else is sitting in MetricSnapshot for this account -
    // written by detectors this file never imports (salesVsCashGap writes
    // monthly_revenue/monthly_cash_collected too, hence the BUILT_IN_KEYS
    // skip below - re-scanning those here would just double the same
    // finding under two code paths) or by a future module's own writer.
    const externalRows = await db.metricSnapshot.findMany({
        where: { accountId, entityType: "account", periodStart: { gte: monthBounds(monthKeys[0]).start } },
        orderBy: { periodStart: "asc" },
    });
    const externalByKey = new Map();
    for (const row of externalRows) {
        if (BUILT_IN_KEYS.has(row.metricKey)) continue;
        const bucket = externalByKey.get(row.metricKey) || { byMonth: new Map(), label: null, labelEn: null };
        bucket.byMonth.set(monthKey(new Date(row.periodStart)), Number(row.value));
        // Writers built before this file's bilingual pass only ever stored
        // `label` (Spanish only) - `labelEn` is optional so those older
        // snapshot rows keep working, just without an English label until
        // that writer is updated to also send one.
        if (row.metadata?.label) bucket.label = row.metadata.label;
        if (row.metadata?.labelEn) bucket.labelEn = row.metadata.labelEn;
        externalByKey.set(row.metricKey, bucket);
    }

    for (const [metricKey, { byMonth, label, labelEn }] of externalByKey.entries()) {
        // Every one of the truly-recent months must actually have a
        // snapshot - a metric that just went quiet is silence, not
        // necessarily a shift, and this detector has no way to tell the
        // two apart for a metric it doesn't understand.
        if (!recentKeys.every((key) => byMonth.has(key))) continue;

        const priorKeys = baselineKeys.filter((key) => byMonth.has(key));
        if (priorKeys.length < MIN_BASELINE_MONTHS) continue;

        const baselineValues = priorKeys.map((key) => byMonth.get(key));
        const recentValues = recentKeys.map((key) => byMonth.get(key));
        const shift = evaluateShift(baselineValues, recentValues);
        if (!shift) continue;

        const series = [...priorKeys, ...recentKeys].map((key) => {
            const { start: periodStart, end: periodEnd } = monthBounds(key);
            return { month: key, value: round2(byMonth.get(key)), periodStart, periodEnd };
        });

        const metricLabel = (isEN ? labelEn : null) || label || humanizeKey(metricKey);
        shifts.push({ metricKey, metricLabel, series, baselineMonths: priorKeys.length, ...shift });
    }

    return shifts;
};

export const runTrajectoryShiftDetector = async ({ accountId, db = prisma, now = new Date() }) => {
    const isEN = await resolveIsEnglish({ accountId, db });
    const shifts = await computeTrajectoryShifts({ accountId, db, now, isEN });
    if (shifts.length === 0) {
        return { discovery: null, created: false, reason: "no_shift_found" };
    }

    const outcomes = [];
    for (const shift of shifts) {
        const relPct = round1(Math.abs(shift.relativeChange) * 100);

        const impact = Math.min(1, Math.abs(shift.relativeChange) / 0.6);
        const urgency = Math.min(1, Math.abs(shift.z) / 4);
        const confidence = Math.min(0.75, 0.35 + Math.min(Math.abs(shift.z), 5) / 5 * 0.25 + Math.min(shift.baselineMonths, 24) / 24 * 0.15);
        const novelty = Math.min(0.9, 0.5 + (shift.baselineMonths / 36) * 0.4);
        const reversibility = 0.6; // direction (good/bad) isn't judged here - see hypothesis field

        const copy = isEN
            ? {
                  directionWord: shift.direction === "up" ? "went up" : "went down",
                  title: (dir) => `"${shift.metricLabel}" ${dir} ${relPct}% compared to behavior that stayed stable for ${shift.baselineMonths} months`,
                  summary: `Over the last ${RECENT_MONTHS} months, "${shift.metricLabel}" averaged ${round2(shift.recentMean)} - vs. a historical average of ${round2(shift.baselineMean)} sustained over the prior ${shift.baselineMonths} months. That's a ${relPct}% change not seen in that period.`,
                  hypothesis: "This level doesn't appear in the account's recent history - it could be the start of a real, sustained change in the business, or a one-off event (a campaign, a season, a new channel) we don't yet know will hold.",
                  unknowns: "We still don't know the cause of this change, whether it's desirable or not, or whether it will hold - only that it's statistically different from what this account had been showing.",
                  recommendation: `Review what changed operationally over the last ${RECENT_MONTHS} months (channel, pricing, team, season) that could explain this move in "${shift.metricLabel}".`,
                  seriesLabel: `${shift.metricLabel} by month`,
                  comparisonLabel: "Recent level vs. historical",
                  predictionStatement: `If this new level of "${shift.metricLabel}" holds, we expect its average over the next ${RECENT_MONTHS} months to stay close to ${round2(shift.recentMean)} instead of reverting to its historical level of ${round2(shift.baselineMean)}.`,
              }
            : {
                  directionWord: shift.direction === "up" ? "subió" : "bajó",
                  title: (dir) => `"${shift.metricLabel}" ${dir} ${relPct}% frente a un comportamiento que se mantuvo estable por ${shift.baselineMonths} meses`,
                  summary: `En los últimos ${RECENT_MONTHS} meses, "${shift.metricLabel}" promedió ${round2(shift.recentMean)} - frente a un promedio histórico de ${round2(shift.baselineMean)} sostenido durante los ${shift.baselineMonths} meses anteriores. Es un cambio de ${relPct}% que no se había visto en ese periodo.`,
                  hypothesis: "Este nivel no aparece en el historial reciente de la cuenta - podría ser el inicio de un cambio real y sostenido en el negocio, o un evento puntual (una campaña, una temporada, un canal nuevo) que todavía no sabemos si va a mantenerse.",
                  unknowns: "Todavía no sabemos la causa de este cambio, ni si es deseable o no, ni si va a mantenerse - solo que es estadísticamente distinto de lo que esta cuenta venía mostrando.",
                  recommendation: `Revisar qué cambió operativamente en los últimos ${RECENT_MONTHS} meses (canal, precios, equipo, temporada) que pueda explicar este movimiento en "${shift.metricLabel}".`,
                  seriesLabel: `${shift.metricLabel} por mes`,
                  comparisonLabel: "Nivel reciente vs. histórico",
                  predictionStatement: `Si este nuevo nivel de "${shift.metricLabel}" se mantiene, esperamos que su promedio en los próximos ${RECENT_MONTHS} meses siga cerca de ${round2(shift.recentMean)} en vez de volver a su nivel histórico de ${round2(shift.baselineMean)}.`,
              };

        const { discovery, created } = await upsertDiscovery({
            accountId,
            detectorKey: DETECTOR_KEY,
            type: "trajectory_shift",
            dedupeKey: `${DETECTOR_KEY}:account:${shift.metricKey}`,
            title: copy.title(copy.directionWord),
            summary: copy.summary,
            hypothesis: copy.hypothesis,
            unknowns: copy.unknowns,
            recommendation: copy.recommendation,
            scores: { impact, novelty, urgency, confidence, reversibility },
            entityCount: 0,
            patternSince: monthBounds(lastNMonthKeys(RECENT_MONTHS, now)[0]).start,
            evidence: [
                {
                    kind: "metric_series",
                    label: copy.seriesLabel,
                    data: shift.series.map((p) => ({ month: p.month, value: p.value })),
                    sourceType: "metric_snapshot",
                    sourceId: null,
                },
                {
                    kind: "comparison",
                    label: copy.comparisonLabel,
                    data: {
                        baseline_months: shift.baselineMonths,
                        baseline_mean: round2(shift.baselineMean),
                        baseline_std_dev: round2(shift.baselineStd),
                        recent_mean: round2(shift.recentMean),
                        z_score: round2(shift.z),
                        relative_change_pct: round1(shift.relativeChange * 100),
                    },
                    sourceType: null,
                    sourceId: null,
                },
            ],
            entities: [],
            predictions: [
                {
                    statement: copy.predictionStatement,
                    predictedData: { metric_key: shift.metricKey, recent_mean_at_prediction: round2(shift.recentMean), baseline_mean_at_prediction: round2(shift.baselineMean) },
                    confidenceAtStake: confidence,
                    checkAfter: new Date(now.getTime() + RECENT_MONTHS * 30 * 24 * 60 * 60 * 1000),
                },
            ],
            db,
        });

        outcomes.push({ discovery, created });
    }

    return { discoveries: outcomes, discovery: outcomes[0]?.discovery || null, created: outcomes.some((o) => o.created) };
};

// Fase 4 learning loop: recomputes the same metric's recent average as of
// "now" and asks whether it stayed near the NEW level the prediction named,
// or reverted back toward the old baseline. A built-in metric recomputes
// straight from Order/CashMovement (metric.compute); an external one - this
// file still doesn't know how to compute it - just re-reads whatever that
// module has since written into MetricSnapshot for the same recent months.
export const checkPrediction = async ({ accountId, prediction, db = prisma, now = new Date() }) => {
    const metricKey = prediction.predictedData?.metric_key;
    const recentMeanAtPrediction = Number(prediction.predictedData?.recent_mean_at_prediction ?? 0);
    const baselineMeanAtPrediction = Number(prediction.predictedData?.baseline_mean_at_prediction ?? 0);

    const monthKeys = lastNMonthKeys(RECENT_MONTHS, now);
    const { start } = monthBounds(monthKeys[0]);
    const { end } = monthBounds(monthKeys[monthKeys.length - 1]);

    const isEN = await resolveIsEnglish({ accountId, db });
    const builtIn = buildMetrics(isEN).find((m) => m.key === metricKey);
    let currentMean;
    if (builtIn) {
        const byMonth = await builtIn.compute(db, accountId, start, end);
        currentMean = mean(monthKeys.map((key) => byMonth.get(key) || 0));
    } else {
        const rows = await db.metricSnapshot.findMany({ where: { accountId, entityType: "account", metricKey, periodStart: { gte: start } } });
        if (rows.length === 0) {
            return {
                outcome: "inconclusive",
                actualData: {},
                notes: isEN
                    ? "No recent snapshots for this metric to re-evaluate it - the module reporting it may have stopped."
                    : "No hay snapshots recientes de esta métrica para volver a evaluarla - el módulo que la reporta pudo haber dejado de hacerlo.",
            };
        }
        currentMean = mean(rows.map((r) => Number(r.value)));
    }

    const distanceToNew = Math.abs(currentMean - recentMeanAtPrediction);
    const distanceToOld = Math.abs(currentMean - baselineMeanAtPrediction);
    const actualData = { recent_mean_at_prediction: round2(recentMeanAtPrediction), baseline_mean_at_prediction: round2(baselineMeanAtPrediction), current_mean: round2(currentMean) };

    if (distanceToNew <= distanceToOld) {
        return {
            outcome: "correct",
            actualData,
            notes: isEN
                ? "The new level held - it's still closer to the recent level than to the prior historical one."
                : "El nuevo nivel se mantuvo - sigue más cerca del nivel reciente que del histórico anterior.",
        };
    }
    return {
        outcome: "incorrect",
        actualData,
        notes: isEN ? "The metric moved back toward its prior historical level - the change didn't hold." : "La métrica volvió a acercarse a su nivel histórico anterior - el cambio no se sostuvo.",
    };
};
