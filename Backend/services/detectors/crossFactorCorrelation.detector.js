// Correlation/co-occurrence mining - the answer to "¿de verdad aprende
// cosas nuevas, o solo repite lo que ya le dijimos?"
//
// Every other detector in this engine (including new_pattern_return_rate,
// its closest relative) tests conditions ONE AT A TIME: "is Tuesday's
// return rate unusual?", "is this point of sale's return rate unusual?".
// A human could still guess most of those - "check return rate by day" is
// an obvious report to ask for. This detector instead searches PAIRS of
// conditions TOGETHER - "Tuesday orders AT this point of sale" - and only
// reports a pair when the combination's return rate is not explained by
// either condition alone (see interactionLift below). Nobody sat down and
// decided in advance to build a "Tuesday × point of sale" report; the
// specific combination that ends up mattering (if any) is only known after
// the search runs against THIS account's real orders.
//
// This is still a fully transparent statistical test (support/lift/z-score
// on a real proportion), not a black-box model - mission section 12 holds:
// every flagged combination can be explained by the exact same numbers a
// person could verify by hand. What's new is that the SEARCH SPACE is
// pairs of conditions instead of single conditions, so the set of things
// Ohnix can notice is no longer bounded by "what report would a human have
// thought to build."

import { prisma } from "../../db/prisma.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";
import { getEnabledDimensionKeys } from "../discoveryDimensionConfig.service.js";
import { resolveIsEnglish } from "../discoveryLocale.service.js";

export const DETECTOR_KEY = "cross_factor_correlation";

const MIN_ACCOUNT_ORDERS = 60;
const MIN_SLICE_ORDERS = 12;
const MIN_Z = 2.5;
const MIN_LIFT_OVER_BASELINE = 1.5;
const MIN_ABS_DIFF_PCT = 10;
// The combined slice must beat the stronger of its two single-condition
// rates by at least this multiple - without this, every flagged pair would
// just be restating whichever single factor already drives the effect
// (already covered by new_pattern_return_rate.detector.js).
const MIN_INTERACTION_LIFT = 1.25;
const MAX_FINDINGS = 2;

const DAY_LABELS = {
    es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const MONTH_LABELS = {
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

const zScoreForProportion = (sliceRate, baselineRate, sliceN) => {
    const se = Math.sqrt((baselineRate * (1 - baselineRate)) / sliceN);
    return se > 0 ? (sliceRate - baselineRate) / se : 0;
};

// Every dimension this detector is ALLOWED to cross - the reviewed,
// tested extraction logic (valueOf/labelOf) stays here in code on purpose,
// never as a string evaluated from the database (see
// DiscoveryDimensionConfig's schema.prisma comment: that's the whole
// "config, not code that writes itself" boundary). What DOES live in the
// database is WHICH of these actually run right now - see
// discoveryDimensionConfig.service.js#getEnabledDimensionKeys, read at the
// top of computeCrossFactorFindings below. `defaultEnabled` is only the
// fallback used when nobody has ever added a config row for that key -
// the original 4 stay on by default (byte-for-byte the same behavior this
// detector always had); the 2 newer ones below ship OFF by default so
// adding search surface is a deliberate config change, not a silent
// widening of what a deploy does. Turning one on later is a database write,
// not a deploy - that's the entire point of this being data.
// `label`/`labelOf` are a function of isEN for the same reason
// new_pattern_return_rate.detector.js's DIMENSIONS became one - dimAlabel/
// valueALabel end up embedded in the title/summary text and in evidence
// data shown to the user.
const buildDimensionRegistry = (isEN) => [
    {
        key: "day_of_week",
        label: isEN ? "Day of week" : "Día de la semana",
        defaultEnabled: true,
        valueOf: (order) => String(new Date(order.orderDate).getUTCDay()),
        labelOf: (value) => (isEN ? DAY_LABELS.en : DAY_LABELS.es)[Number(value)],
    },
    {
        key: "channel",
        label: isEN ? "Sales channel" : "Canal de venta",
        defaultEnabled: true,
        valueOf: (order) => order.channel,
        labelOf: (value) => value,
    },
    {
        key: "point_of_sale",
        label: isEN ? "Point of sale" : "Punto de venta",
        defaultEnabled: true,
        valueOf: (order) => order.pointOfSaleId,
        labelOf: (value, posNames) => posNames.get(value) || value,
    },
    {
        key: "customer_type",
        label: isEN ? "Customer type" : "Tipo de cliente",
        defaultEnabled: true,
        valueOf: (order) => order.customerType || "regular",
        labelOf: (value) => value,
    },
    {
        key: "is_weekend",
        label: isEN ? "Weekend" : "Fin de semana",
        defaultEnabled: false,
        valueOf: (order) => {
            const day = new Date(order.orderDate).getUTCDay();
            return day === 0 || day === 6 ? "weekend" : "weekday";
        },
        labelOf: (value) => (isEN ? (value === "weekend" ? "weekend" : "weekday") : value === "weekend" ? "fin de semana" : "entre semana"),
    },
    {
        key: "month_of_year",
        label: isEN ? "Month of year" : "Mes del año",
        defaultEnabled: false,
        valueOf: (order) => String(new Date(order.orderDate).getUTCMonth()),
        labelOf: (value) => (isEN ? MONTH_LABELS.en : MONTH_LABELS.es)[Number(value)],
    },
];

const pairsOf = (dimensions) => dimensions.flatMap((a, i) => dimensions.slice(i + 1).map((b) => [a, b]));

// Metadata-only view for the admin config endpoint (routes/
// discoveryDimensionConfig.routes.js) - deliberately excludes valueOf/
// labelOf: those are the reviewed extraction logic itself and must never
// leave this module, let alone reach an HTTP response. Spanish-only for
// now (the admin tool is internal, unlike the customer-facing Discovery
// text below) - not wired to the requesting admin's own preferredLanguage.
export const DIMENSION_METADATA = buildDimensionRegistry(false).map(({ key, label, defaultEnabled }) => ({ key, label, defaultEnabled }));

// `dimensionKeys`, when passed, FORCES exactly those dimensions into the
// search regardless of what's currently enabled - used only by
// checkPrediction below, so re-verifying a Discovery that was published
// while a dimension was active still works correctly even if that
// dimension has since been turned off (disabling one only stops NEW
// searches from using it, it must never make an already-published finding
// impossible to re-check).
export const computeCrossFactorFindings = async ({ accountId, db = prisma, dimensionKeys = null, isEN = false }) => {
    const DIMENSION_REGISTRY = buildDimensionRegistry(isEN);
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

    const activeKeys = dimensionKeys
        ? new Set(dimensionKeys)
        : await getEnabledDimensionKeys({ detectorKey: DETECTOR_KEY, registry: DIMENSION_REGISTRY, db });
    const activeDimensions = DIMENSION_REGISTRY.filter((d) => activeKeys.has(d.key));
    const activePairs = pairsOf(activeDimensions);

    // Single-dimension rates for every (dimension, value) - needed as the
    // "what would we already have expected" baseline each pair is tested
    // against, not just the account-wide rate.
    const singleRateOf = new Map(); // `${dimKey}:${value}` -> rate
    for (const dimension of activeDimensions) {
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
            singleRateOf.set(`${dimension.key}:${value}`, bucket.returned / bucket.total);
        }
    }

    const candidates = [];
    for (const [dimA, dimB] of activePairs) {
        const combined = new Map(); // `${valueA}||${valueB}` -> { valueA, valueB, total, returned }
        for (const order of orders) {
            const valueA = dimA.valueOf(order);
            const valueB = dimB.valueOf(order);
            if (valueA === null || valueA === undefined || valueB === null || valueB === undefined) continue;
            const key = `${valueA}||${valueB}`;
            const bucket = combined.get(key) || { valueA, valueB, total: 0, returned: 0 };
            bucket.total += 1;
            if (order.orderStatus === "returned") bucket.returned += 1;
            combined.set(key, bucket);
        }

        for (const bucket of combined.values()) {
            if (bucket.total < MIN_SLICE_ORDERS) continue;
            const combinedRate = bucket.returned / bucket.total;
            const z = zScoreForProportion(combinedRate, baselineRate, bucket.total);
            const liftOverBaseline = baselineRate > 0 ? combinedRate / baselineRate : combinedRate > 0 ? Infinity : 0;
            const absDiffPct = (combinedRate - baselineRate) * 100;

            const rateA = singleRateOf.get(`${dimA.key}:${bucket.valueA}`) ?? baselineRate;
            const rateB = singleRateOf.get(`${dimB.key}:${bucket.valueB}`) ?? baselineRate;
            const strongerSingleRate = Math.max(rateA, rateB);
            const interactionLift = strongerSingleRate > 0 ? combinedRate / strongerSingleRate : combinedRate > 0 ? Infinity : 1;

            if (z < MIN_Z || liftOverBaseline < MIN_LIFT_OVER_BASELINE || absDiffPct < MIN_ABS_DIFF_PCT || interactionLift < MIN_INTERACTION_LIFT) continue;

            // Within condition A alone, how the rate varies across every
            // value of B - makes the interaction visible instead of asking
            // the reader to trust a single z-score (mission section 12).
            const withinA = new Map();
            for (const order of orders) {
                if (dimA.valueOf(order) !== bucket.valueA) continue;
                const valueB = dimB.valueOf(order);
                if (valueB === null || valueB === undefined) continue;
                const b = withinA.get(valueB) || { total: 0, returned: 0 };
                b.total += 1;
                if (order.orderStatus === "returned") b.returned += 1;
                withinA.set(valueB, b);
            }

            candidates.push({
                dimAKey: dimA.key,
                dimBKey: dimB.key,
                dimALabel: dimA.label,
                dimBLabel: dimB.label,
                valueA: bucket.valueA,
                valueB: bucket.valueB,
                valueALabel: dimA.labelOf(bucket.valueA, posNames),
                valueBLabel: dimB.labelOf(bucket.valueB, posNames),
                sliceOrders: bucket.total,
                sliceReturned: bucket.returned,
                combinedRatePct: round1(combinedRate * 100),
                baselineRatePct: round1(baselineRate * 100),
                rateAPct: round1(rateA * 100),
                rateBPct: round1(rateB * 100),
                z: round2(z),
                liftOverBaseline: round2(liftOverBaseline),
                interactionLift: round2(interactionLift),
                absDiffPct: round1(absDiffPct),
                withinADistribution: [...withinA.entries()]
                    .filter(([, b]) => b.total >= Math.max(5, Math.floor(MIN_SLICE_ORDERS / 2)))
                    .map(([v, b]) => ({
                        value: `${dimA.labelOf(bucket.valueA, posNames)} · ${dimB.labelOf(v, posNames)}`,
                        orders: b.total,
                        return_rate_pct: round1((b.returned / b.total) * 100),
                    })),
            });
        }
    }

    // At most one finding per dimension-pair (the most extreme combination
    // for that pair), same anti-flood rule as new_pattern_return_rate.
    const bestPerPair = new Map();
    for (const candidate of candidates) {
        const pairKey = `${candidate.dimAKey}:${candidate.dimBKey}`;
        const existing = bestPerPair.get(pairKey);
        if (!existing || candidate.z > existing.z) bestPerPair.set(pairKey, candidate);
    }
    const findings = [...bestPerPair.values()].sort((a, b) => b.z - a.z).slice(0, MAX_FINDINGS);

    return { findings, candidates, accountOrders: orders.length, baselineRatePct: round1(baselineRate * 100) };
};

export const runCrossFactorCorrelationDetector = async ({ accountId, db = prisma }) => {
    const isEN = await resolveIsEnglish({ accountId, db });
    const { findings, reason } = await computeCrossFactorFindings({ accountId, db, isEN });
    if (findings.length === 0) {
        return { discovery: null, created: false, reason: reason || "no_pattern_found" };
    }

    const outcomes = [];
    for (const finding of findings) {
        const impact = Math.min(1, finding.absDiffPct / 30);
        const urgency = Math.min(1, finding.z / 6);
        const confidence = Math.min(
            0.65,
            0.25 + (Math.min(finding.z, 6) / 6) * 0.2 + (Math.min(finding.sliceOrders, 80) / 80) * 0.1 + (Math.min(finding.interactionLift, 3) / 3) * 0.1
        );
        // Higher than new_pattern_return_rate's 0.7 on purpose - nobody
        // pre-specified this exact PAIR of conditions, only the individual
        // attributes existed as ideas before this search ran.
        const novelty = 0.8;
        const reversibility = 0.6;

        const copy = isEN
            ? {
                  title: `Found a combination nobody had crossed before: "${finding.valueALabel}" + "${finding.valueBLabel}" drives up the return rate`,
                  summary: `Orders where "${finding.dimALabel.toLowerCase()}" is "${finding.valueALabel}" AND "${finding.dimBLabel.toLowerCase()}" is "${finding.valueBLabel}" at the same time (${finding.sliceOrders} orders) have a ${finding.combinedRatePct}% return rate, vs. the account's overall ${finding.baselineRatePct}%. Separately, "${finding.valueALabel}" has ${finding.rateAPct}% and "${finding.valueBLabel}" has ${finding.rateBPct}% - neither condition alone explains what happens when they occur together.`,
                  hypothesis: `This specific combination wasn't defined in any report or alert - I found it by automatically crossing "${finding.dimALabel.toLowerCase()}" and "${finding.dimBLabel.toLowerCase()}" against the rest of the account. Something about that specific combination (not each condition separately) is associated with more returns.`,
                  unknowns: "We don't yet know if there's a third underlying variable explaining both conditions at once (e.g. an employee, a supplier, or a product that coincides with this combination), nor whether the cause is logistics, quality, or customer expectations.",
                  recommendation: `Review a sample of orders with "${finding.valueALabel}" + "${finding.valueBLabel}" to look for a common cause before treating them as two separate problems.`,
                  comparisonLabel: "Return rate: combination vs. each condition separately vs. the account",
                  distributionLabel: `Return rate within "${finding.valueALabel}", by "${finding.dimBLabel.toLowerCase()}"`,
                  predictionStatement: `If this combination is real, "${finding.valueALabel}" + "${finding.valueBLabel}" should keep showing a return rate above the overall average over the next 90 days.`,
              }
            : {
                  title: `Encontré una combinación que nadie había cruzado antes: "${finding.valueALabel}" + "${finding.valueBLabel}" dispara la tasa de devolución`,
                  summary: `Los pedidos donde "${finding.dimALabel.toLowerCase()}" es "${finding.valueALabel}" Y "${finding.dimBLabel.toLowerCase()}" es "${finding.valueBLabel}" a la vez (${finding.sliceOrders} pedidos) tienen ${finding.combinedRatePct}% de devoluciones, frente al ${finding.baselineRatePct}% general de la cuenta. Por separado, "${finding.valueALabel}" tiene ${finding.rateAPct}% y "${finding.valueBLabel}" tiene ${finding.rateBPct}% - ninguna de las dos condiciones por sí sola explica lo que pasa cuando ocurren juntas.`,
                  hypothesis: `Esta combinación específica no estaba definida en ningún reporte ni alerta - la encontré cruzando automáticamente "${finding.dimALabel.toLowerCase()}" y "${finding.dimBLabel.toLowerCase()}" contra el resto de la cuenta. Hay algo en esa combinación concreta (no en cada condición por separado) asociado con más devoluciones.`,
                  unknowns: "No sé todavía si hay una tercera variable de fondo explicando ambas condiciones a la vez (por ejemplo, un empleado, un proveedor o un producto que coincide con esta combinación), ni si la causa es logística, de calidad o de expectativa del cliente.",
                  recommendation: `Revisar una muestra de pedidos con "${finding.valueALabel}" + "${finding.valueBLabel}" para buscar una causa común antes de tratarlas como dos problemas separados.`,
                  comparisonLabel: "Tasa de devolución: combinación vs. cada condición por separado vs. la cuenta",
                  distributionLabel: `Tasa de devolución dentro de "${finding.valueALabel}", por "${finding.dimBLabel.toLowerCase()}"`,
                  predictionStatement: `Si esta combinación es real, "${finding.valueALabel}" + "${finding.valueBLabel}" debería seguir con una tasa de devolución por encima del promedio general en los próximos 90 días.`,
              };

        const { discovery, created } = await upsertDiscovery({
            accountId,
            detectorKey: DETECTOR_KEY,
            type: "connection",
            dedupeKey: `${DETECTOR_KEY}:account:${finding.dimAKey}:${finding.valueA}:${finding.dimBKey}:${finding.valueB}`,
            title: copy.title,
            summary: copy.summary,
            hypothesis: copy.hypothesis,
            unknowns: copy.unknowns,
            recommendation: copy.recommendation,
            scores: { impact, novelty, urgency, confidence, reversibility },
            entityCount: 0,
            patternSince: null,
            evidence: [
                {
                    kind: "comparison",
                    label: copy.comparisonLabel,
                    data: {
                        dimension: `${finding.dimALabel} + ${finding.dimBLabel}`,
                        value: `${finding.valueALabel} + ${finding.valueBLabel}`,
                        slice_orders: finding.sliceOrders,
                        slice_returned: finding.sliceReturned,
                        slice_return_rate_pct: finding.combinedRatePct,
                        account_return_rate_pct: finding.baselineRatePct,
                        lift: finding.liftOverBaseline,
                        z_score: finding.z,
                    },
                    sourceType: "order",
                    sourceId: null,
                },
                {
                    kind: "cohort_sample",
                    label: copy.distributionLabel,
                    data: finding.withinADistribution,
                    sourceType: null,
                    sourceId: null,
                },
            ],
            entities: [],
            predictions: [
                {
                    statement: copy.predictionStatement,
                    predictedData: {
                        dim_a_key: finding.dimAKey,
                        value_a: finding.valueA,
                        dim_b_key: finding.dimBKey,
                        value_b: finding.valueB,
                        combined_rate_pct_at_prediction: finding.combinedRatePct,
                        baseline_rate_pct_at_prediction: finding.baselineRatePct,
                    },
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

// Fase 4 learning loop: recomputes the same pair's combined return rate
// against the account's CURRENT data and checks whether the interaction
// held up - same shape as new_pattern_return_rate.detector.js#checkPrediction.
export const checkPrediction = async ({ accountId, prediction, db = prisma }) => {
    const isEN = await resolveIsEnglish({ accountId, db });
    const { dim_a_key: dimAKey, value_a: valueA, dim_b_key: dimBKey, value_b: valueB } = prediction.predictedData || {};
    if (!dimAKey || valueA === undefined || !dimBKey || valueB === undefined) {
        return {
            outcome: "inconclusive",
            actualData: {},
            notes: isEN ? "The prediction didn't record a specific combination to re-evaluate." : "La predicción no registró una combinación específica para volver a evaluar.",
        };
    }

    const { candidates } = await computeCrossFactorFindings({ accountId, db, dimensionKeys: [dimAKey, dimBKey], isEN });
    const stillFlagged = (candidates || []).find(
        (f) => f.dimAKey === dimAKey && String(f.valueA) === String(valueA) && f.dimBKey === dimBKey && String(f.valueB) === String(valueB)
    );

    const actualData = {
        combined_rate_pct_at_prediction: prediction.predictedData?.combined_rate_pct_at_prediction,
        baseline_rate_pct_at_prediction: prediction.predictedData?.baseline_rate_pct_at_prediction,
        still_flagged: Boolean(stillFlagged),
        combined_rate_pct_at_check: stillFlagged?.combinedRatePct ?? null,
        baseline_rate_pct_at_check: stillFlagged?.baselineRatePct ?? null,
    };

    if (stillFlagged) {
        return {
            outcome: "correct",
            actualData,
            notes: isEN
                ? "The combination still has a return rate notably above the account average."
                : "La combinación sigue teniendo una tasa de devolución notablemente por encima del promedio de la cuenta.",
        };
    }
    return {
        outcome: "incorrect",
        actualData,
        notes: isEN
            ? "The combination no longer shows an unusual return rate - the gap closed."
            : "La combinación ya no muestra una tasa de devolución fuera de lo normal - la brecha se cerró.",
    };
};
