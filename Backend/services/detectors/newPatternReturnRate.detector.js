// Mission case D ("patrones nuevos"): "Encontré un patrón que no estaba
// definido en Ohnix." Every other detector in this engine tests ONE
// specific business hypothesis (churn, lookalikes, a supplier, a metric's
// own history). This one instead searches several account attributes that
// nobody has ever wired into a report - day of the week, sales channel,
// point of sale, customer type - and reports whichever single slice's
// return rate stands out from the account's overall rate. The SEARCH is
// generic (it doesn't presuppose which dimension matters), even though
// what it can find is still bounded by the dimensions listed in
// DIMENSIONS below - a true open-ended pattern finder would need to
// discover the dimensions themselves, out of scope for a rule-based engine.
//
// Return rate (not revenue or count) is the outcome on purpose: it's a
// proportion, which has a well-understood, simple significance test (a
// one-sample z-test against the account's own overall rate) - no need to
// invent a bespoke threshold per dimension.

import { prisma } from "../../db/prisma.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";

export const DETECTOR_KEY = "new_pattern_return_rate";

const MIN_ACCOUNT_ORDERS = 60;
const MIN_SLICE_ORDERS = 15;
const MIN_Z = 2.5;
const MIN_LIFT = 1.5;
const MIN_ABS_DIFF_PCT = 10;
const MAX_FINDINGS = 2;

const DAY_LABELS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

const zScoreForProportion = (sliceRate, baselineRate, sliceN) => {
    const p0 = baselineRate;
    const se = Math.sqrt((p0 * (1 - p0)) / sliceN);
    return se > 0 ? (sliceRate - p0) / se : 0;
};

// Groups orders by one dimension's value, returning [{ value, label, total, returned }].
const DIMENSIONS = [
    {
        key: "day_of_week",
        label: "Día de la semana",
        valueOf: (order) => String(new Date(order.orderDate).getUTCDay()),
        labelOf: (value) => DAY_LABELS_ES[Number(value)],
    },
    {
        key: "channel",
        label: "Canal de venta",
        valueOf: (order) => order.channel,
        labelOf: (value) => value,
    },
    {
        key: "point_of_sale",
        label: "Punto de venta",
        valueOf: (order) => order.pointOfSaleId,
        labelOf: (value, posNames) => posNames.get(value) || value,
    },
    {
        key: "customer_type",
        label: "Tipo de cliente",
        valueOf: (order) => order.customerType || "regular",
        labelOf: (value) => value,
    },
];

export const computeNewPatterns = async ({ accountId, db = prisma }) => {
    const rawOrders = await db.order.findMany({
        where: { createdById: accountId, orderStatus: { in: ["completed", "returned"] } },
        select: { orderDate: true, channel: true, pointOfSaleId: true, orderStatus: true, customer: { select: { type: true } } },
    });
    const orders = rawOrders.map((o) => ({ ...o, customerType: o.customer?.type }));

    if (orders.length < MIN_ACCOUNT_ORDERS) {
        return { findings: [], reason: "insufficient_history", accountOrders: orders.length };
    }

    const baselineReturned = orders.filter((o) => o.orderStatus === "returned").length;
    const baselineRate = baselineReturned / orders.length;

    const posNames = new Map(
        (await db.pointOfSale.findMany({ where: { accountId }, select: { id: true, name: true } })).map((p) => [p.id, p.name])
    );

    const candidates = [];
    for (const dimension of DIMENSIONS) {
        const byValue = new Map();
        for (const order of orders) {
            const value = dimension.valueOf(order);
            if (value === null || value === undefined) continue;
            const bucket = byValue.get(value) || { total: 0, returned: 0 };
            bucket.total += 1;
            if (order.orderStatus === "returned") bucket.returned += 1;
            byValue.set(value, bucket);
        }

        for (const [value, bucket] of byValue.entries()) {
            if (bucket.total < MIN_SLICE_ORDERS) continue;
            const sliceRate = bucket.returned / bucket.total;
            const z = zScoreForProportion(sliceRate, baselineRate, bucket.total);
            const lift = baselineRate > 0 ? sliceRate / baselineRate : sliceRate > 0 ? Infinity : 0;
            const absDiffPct = (sliceRate - baselineRate) * 100;

            if (z < MIN_Z || lift < MIN_LIFT || absDiffPct < MIN_ABS_DIFF_PCT) continue;

            candidates.push({
                dimensionKey: dimension.key,
                dimensionLabel: dimension.label,
                value,
                valueLabel: dimension.labelOf(value, posNames),
                sliceOrders: bucket.total,
                sliceReturned: bucket.returned,
                sliceRatePct: round1(sliceRate * 100),
                baselineRatePct: round1(baselineRate * 100),
                z: round2(z),
                lift: round2(lift),
                absDiffPct: round1(absDiffPct),
                distribution: [...byValue.entries()]
                    .filter(([, b]) => b.total >= MIN_SLICE_ORDERS)
                    .map(([v, b]) => ({
                        value: dimension.labelOf(v, posNames),
                        orders: b.total,
                        return_rate_pct: round1((b.returned / b.total) * 100),
                    })),
            });
        }
    }

    // At most one finding per dimension (the most extreme value for that
    // dimension), ranked by how surprising it is - avoids flooding the user
    // with every day of the week that happened to clear the bar. `findings`
    // is what the detector actually publishes; `candidates` (every
    // value/dimension pair that cleared the per-slice thresholds, before
    // this capping) is what checkPrediction searches later - a slice a
    // prediction named can still be true even after it stops being the
    // SINGLE most extreme one in its dimension or in the account-wide top 2.
    const bestPerDimension = new Map();
    for (const candidate of candidates) {
        const existing = bestPerDimension.get(candidate.dimensionKey);
        if (!existing || candidate.z > existing.z) bestPerDimension.set(candidate.dimensionKey, candidate);
    }
    const findings = [...bestPerDimension.values()].sort((a, b) => b.z - a.z).slice(0, MAX_FINDINGS);

    return { findings, candidates, accountOrders: orders.length, baselineRatePct: round1(baselineRate * 100) };
};

export const runNewPatternReturnRateDetector = async ({ accountId, db = prisma }) => {
    const { findings, reason, baselineRatePct } = await computeNewPatterns({ accountId, db });
    if (findings.length === 0) {
        return { discovery: null, created: false, reason: reason || "no_pattern_found" };
    }

    const outcomes = [];
    for (const finding of findings) {
        const impact = Math.min(1, finding.absDiffPct / 30);
        const urgency = Math.min(1, finding.z / 6);
        const confidence = Math.min(0.7, 0.3 + Math.min(finding.z, 6) / 6 * 0.25 + Math.min(finding.sliceOrders, 100) / 100 * 0.15);
        const novelty = 0.7; // by construction this is a slice nobody had a pre-built report for
        const reversibility = 0.65; // usually a process/QA fix, not structural

        const { discovery, created } = await upsertDiscovery({
            accountId,
            detectorKey: DETECTOR_KEY,
            type: "new_pattern",
            dedupeKey: `${DETECTOR_KEY}:account:${finding.dimensionKey}:${finding.value}`,
            title: `Encontré un patrón que no estaba definido en Ohnix: ${finding.dimensionLabel.toLowerCase()} "${finding.valueLabel}" tiene una tasa de devolución fuera de lo normal`,
            summary: `Los pedidos donde "${finding.dimensionLabel.toLowerCase()}" es "${finding.valueLabel}" (${finding.sliceOrders} pedidos) tienen una tasa de devolución de ${finding.sliceRatePct}%, frente al ${finding.baselineRatePct}% general de la cuenta - ${finding.lift}x más. Esta combinación no está definida como métrica ni alerta en ningún reporte existente.`,
            hypothesis: "Algo específico de esta condición (el día, el canal, el punto de venta o el tipo de cliente) está asociado con una mayor tasa de devolución - correlación encontrada por búsqueda automática, no una causa ya confirmada.",
            unknowns: "No hemos investigado todavía la causa específica (calidad, logística, expectativa del cliente, un producto en particular) ni si la asociación se mantiene controlando por otras variables al mismo tiempo.",
            recommendation: `Revisar manualmente una muestra de las devoluciones de "${finding.valueLabel}" para identificar una causa común.`,
            scores: { impact, novelty, urgency, confidence, reversibility },
            entityCount: 0,
            patternSince: null,
            evidence: [
                {
                    kind: "comparison",
                    label: "Tasa de devolución: esta condición vs. el resto de la cuenta",
                    data: {
                        dimension: finding.dimensionLabel,
                        value: finding.valueLabel,
                        slice_orders: finding.sliceOrders,
                        slice_returned: finding.sliceReturned,
                        slice_return_rate_pct: finding.sliceRatePct,
                        account_return_rate_pct: finding.baselineRatePct,
                        lift: finding.lift,
                        z_score: finding.z,
                    },
                    sourceType: "order",
                    sourceId: null,
                },
                {
                    kind: "cohort_sample",
                    label: `Tasa de devolución por "${finding.dimensionLabel}" (distribución completa)`,
                    data: finding.distribution,
                    sourceType: null,
                    sourceId: null,
                },
            ],
            entities: [],
            predictions: [
                {
                    statement: `Si este patrón es real, la tasa de devolución de "${finding.valueLabel}" debería seguir por encima del promedio general de la cuenta en los próximos 90 días.`,
                    predictedData: { dimension_key: finding.dimensionKey, value: finding.value, slice_rate_pct_at_prediction: finding.sliceRatePct, baseline_rate_pct_at_prediction: finding.baselineRatePct },
                    confidenceAtStake: confidence,
                    checkAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                },
            ],
            db,
        });

        outcomes.push({ discovery, created });
    }

    return { discoveries: outcomes, discovery: outcomes[0]?.discovery || null, created: outcomes.some((o) => o.created) };
};

// Fase 4 learning loop: recomputes the same dimension/value slice's return
// rate against the account's CURRENT overall rate, and checks whether the
// gap the prediction described held up.
export const checkPrediction = async ({ accountId, prediction, db = prisma }) => {
    const dimension = DIMENSIONS.find((d) => d.key === prediction.predictedData?.dimension_key);
    const targetValue = prediction.predictedData?.value;
    if (!dimension || targetValue === undefined) {
        return { outcome: "inconclusive", actualData: {}, notes: "La predicción no registró una condición específica para volver a evaluar." };
    }

    const { candidates } = await computeNewPatterns({ accountId, db });
    // Searches every slice that still clears the per-slice thresholds, NOT
    // just the capped top-2 `findings` the detector publishes - the named
    // slice can still be true even if it's no longer the single most
    // extreme value in its dimension.
    const stillFlagged = (candidates || []).find((f) => f.dimensionKey === dimension.key && String(f.value) === String(targetValue));

    const actualData = {
        slice_rate_pct_at_prediction: prediction.predictedData?.slice_rate_pct_at_prediction,
        baseline_rate_pct_at_prediction: prediction.predictedData?.baseline_rate_pct_at_prediction,
        still_flagged: Boolean(stillFlagged),
        slice_rate_pct_at_check: stillFlagged?.sliceRatePct ?? null,
        baseline_rate_pct_at_check: stillFlagged?.baselineRatePct ?? null,
    };

    if (stillFlagged) {
        return { outcome: "correct", actualData, notes: "La condición sigue teniendo una tasa de devolución notablemente por encima del promedio de la cuenta." };
    }
    return { outcome: "incorrect", actualData, notes: "La condición ya no muestra una tasa de devolución fuera de lo normal - la brecha se cerró." };
};
