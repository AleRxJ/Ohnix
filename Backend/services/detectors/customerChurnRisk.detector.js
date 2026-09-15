// Mission case 1 / flagship example: "17 clientes están entrando en un
// patrón que históricamente precedió pérdidas." For each customer with
// enough order history, compares how overdue they currently are against
// their OWN historical buying rhythm (not a generic "N days of
// inactivity" rule, which would flag a naturally-infrequent buyer as risky
// just as often as a genuinely decaying one). Customers who are overdue by
// a similar or greater ratio than customers who went on to stop buying
// entirely become the "historical precedent" this detector's evidence
// leans on - no precedent cohort, no discovery (mission rule 5).
//
// Deliberately conservative: needs several customers past the risk
// threshold AND several already-fully-inactive customers to point to as
// precedent before it says anything.

import { prisma } from "../../db/prisma.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";

export const DETECTOR_KEY = "customer_churn_risk";

const MIN_ORDERS_FOR_BASELINE = 3;
// "At risk": overdue by at least this many times their own normal cadence,
// but not yet past CHURNED_RATIO (still recoverable, still "entering" the
// pattern rather than already gone).
const RISK_RATIO_MIN = 1.8;
// Past this ratio a customer is treated as the historical-precedent
// cohort - already fully inactive, no longer "at risk" but "gone".
const CHURNED_RATIO_MIN = 4.0;
const MIN_AT_RISK_COUNT = 3;
const MIN_PRECEDENT_COUNT = 2;
const MAX_LISTED_CUSTOMERS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

// Pure per-customer computation, shared by the detector and by
// discoveryLearning.service.js's later prediction check. Pass
// `customerIds` to score only a specific set of customers (the check only
// cares about the customers the original prediction named) instead of
// every customer on the account.
export const computeCustomerRiskProfiles = async ({ accountId, db = prisma, now = new Date(), customerIds = null }) => {
    const orders = await db.order.findMany({
        where: {
            createdById: accountId,
            orderStatus: { not: "cancelled" },
            ...(customerIds ? { customerId: { in: customerIds } } : {}),
        },
        select: { customerId: true, orderDate: true, total: true },
        orderBy: { orderDate: "asc" },
    });

    const byCustomer = new Map();
    for (const order of orders) {
        const list = byCustomer.get(order.customerId) || [];
        list.push({ date: new Date(order.orderDate), total: Number(order.total) });
        byCustomer.set(order.customerId, list);
    }

    const profiles = [];
    for (const [customerId, customerOrders] of byCustomer.entries()) {
        if (customerOrders.length < MIN_ORDERS_FOR_BASELINE) continue;

        const intervals = [];
        for (let i = 1; i < customerOrders.length; i++) {
            intervals.push((customerOrders[i].date - customerOrders[i - 1].date) / DAY_MS);
        }
        const baselineIntervalDays = Math.max(median(intervals), 1);
        const lastOrderDate = customerOrders[customerOrders.length - 1].date;
        const daysSinceLastOrder = (now - lastOrderDate) / DAY_MS;
        const riskRatio = daysSinceLastOrder / baselineIntervalDays;
        const lifetimeValue = customerOrders.reduce((sum, o) => sum + o.total, 0);

        profiles.push({ customerId, baselineIntervalDays, daysSinceLastOrder, riskRatio, lifetimeValue, orderCount: customerOrders.length });
    }

    return profiles;
};

export const runCustomerChurnRiskDetector = async ({ accountId, db = prisma, now = new Date() }) => {
    const profiles = await computeCustomerRiskProfiles({ accountId, db, now });

    const atRisk = profiles.filter((p) => p.riskRatio >= RISK_RATIO_MIN && p.riskRatio < CHURNED_RATIO_MIN);
    const churnedPrecedent = profiles.filter((p) => p.riskRatio >= CHURNED_RATIO_MIN);

    if (atRisk.length < MIN_AT_RISK_COUNT || churnedPrecedent.length < MIN_PRECEDENT_COUNT) {
        return {
            discovery: null,
            created: false,
            reason: atRisk.length < MIN_AT_RISK_COUNT ? "not_enough_at_risk_customers" : "no_historical_precedent",
            atRiskCount: atRisk.length,
            precedentCount: churnedPrecedent.length,
        };
    }

    const totalConsideredRevenue = profiles.reduce((sum, p) => sum + p.lifetimeValue, 0);
    const atRiskRevenue = atRisk.reduce((sum, p) => sum + p.lifetimeValue, 0);
    const revenueSharePct = totalConsideredRevenue > 0 ? (atRiskRevenue / totalConsideredRevenue) * 100 : 0;
    const avgRiskRatio = atRisk.reduce((sum, p) => sum + p.riskRatio, 0) / atRisk.length;

    const impact = Math.min(1, revenueSharePct / 25);
    const urgency = Math.min(1, Math.max(0, (avgRiskRatio - RISK_RATIO_MIN) / (CHURNED_RATIO_MIN - RISK_RATIO_MIN)));
    const confidence = Math.min(0.8, 0.4 + Math.min(churnedPrecedent.length, 20) / 20 * 0.3 + Math.min(atRisk.length, 20) / 20 * 0.1);
    const novelty = 0.55;
    const reversibility = 0.65; // a retention outreach is a real, fairly reversible lever

    const customerNames = await db.customer.findMany({
        where: { id: { in: atRisk.map((p) => p.customerId) } },
        select: { id: true, name: true },
    });
    const nameById = new Map(customerNames.map((c) => [c.id, c.name]));

    const sortedAtRisk = [...atRisk].sort((a, b) => b.lifetimeValue - a.lifetimeValue);

    const { discovery, created } = await upsertDiscovery({
        accountId,
        detectorKey: DETECTOR_KEY,
        type: "risk",
        dedupeKey: `${DETECTOR_KEY}:account`,
        title: `${atRisk.length} clientes están entrando en un patrón que históricamente termina en pérdida del cliente`,
        summary: `${atRisk.length} clientes llevan comprando con una frecuencia ${round1(avgRiskRatio)}x más lenta que su propio ritmo histórico - un nivel de atraso parecido al que tenían ${churnedPrecedent.length} clientes justo antes de dejar de comprar por completo. Estos ${atRisk.length} clientes representan ${round1(revenueSharePct)}% de los ingresos históricos de la base de clientes analizada.`,
        hypothesis: "Los clientes que se atrasan más de 1.8x su propio ciclo de compra normal, sin todavía llegar a 4x, tienden históricamente a seguir el mismo camino que los clientes que ya dejaron de comprar del todo - la brecha con su ritmo normal sigue ampliándose en vez de corregirse sola.",
        unknowns: "No sabemos todavía si hay una causa común entre estos clientes (precio, servicio, un competidor, estacionalidad de su propio negocio) ni si cada uno individualmente va a reactivarse o no - es un patrón agregado, no una certeza por cliente.",
        recommendation: "Priorizar contacto/retención con los clientes de mayor valor histórico en esta lista antes de que crucen el umbral de inactividad total.",
        scores: { impact, novelty, urgency, confidence, reversibility },
        entityCount: atRisk.length,
        patternSince: null,
        evidence: [
            {
                kind: "cohort_sample",
                label: "Clientes en riesgo (ordenados por valor histórico)",
                data: sortedAtRisk.slice(0, MAX_LISTED_CUSTOMERS).map((p) => ({
                    customer_id: p.customerId,
                    customer_name: nameById.get(p.customerId) || null,
                    days_since_last_order: Math.round(p.daysSinceLastOrder),
                    baseline_interval_days: round1(p.baselineIntervalDays),
                    risk_ratio: round2(p.riskRatio),
                    lifetime_value: round2(p.lifetimeValue),
                    order_count: p.orderCount,
                })),
                sourceType: "customer",
                sourceId: null,
            },
            {
                kind: "comparison",
                label: "Precedente histórico: clientes que llegaron a inactividad total",
                data: {
                    at_risk_count: atRisk.length,
                    churned_precedent_count: churnedPrecedent.length,
                    risk_ratio_threshold: RISK_RATIO_MIN,
                    churned_ratio_threshold: CHURNED_RATIO_MIN,
                    avg_risk_ratio_among_at_risk: round2(avgRiskRatio),
                },
                sourceType: null,
                sourceId: null,
            },
            {
                kind: "metric",
                label: "Ingresos históricos en riesgo",
                data: {
                    at_risk_lifetime_revenue: round2(atRiskRevenue),
                    total_customer_revenue_considered: round2(totalConsideredRevenue),
                    share_pct: round1(revenueSharePct),
                },
                sourceType: "order",
                sourceId: null,
            },
        ],
        entities: atRisk.map((p) => ({
            entityType: "customer",
            entityId: p.customerId,
            role: "at_risk",
            metadata: {
                days_since_last_order: Math.round(p.daysSinceLastOrder),
                baseline_interval_days: round1(p.baselineIntervalDays),
                risk_ratio: round2(p.riskRatio),
                lifetime_value: round2(p.lifetimeValue),
            },
        })),
        predictions: [
            {
                statement: `Si no hay intervención, se espera que al menos parte de estos ${atRisk.length} clientes crucen el umbral de inactividad total (${CHURNED_RATIO_MIN}x su ciclo normal) en los próximos 60 días.`,
                predictedData: {
                    at_risk_customer_ids: atRisk.map((p) => p.customerId).slice(0, 100),
                    churned_ratio_threshold: CHURNED_RATIO_MIN,
                    at_risk_count_at_prediction: atRisk.length,
                },
                confidenceAtStake: confidence,
                checkAfter: new Date(now.getTime() + 60 * DAY_MS),
            },
        ],
        db,
    });

    return { discovery, created, atRisk, churnedPrecedent, revenueSharePct, avgRiskRatio };
};

// Fase 4 learning loop: re-scores the specific customers the prediction
// named, as of "now" (whatever day checkAfter has arrived). A customer who
// placed a new order since is no longer at risk at all - recovered on
// their own, which the prediction did NOT claim would happen, but isn't a
// failure of it either (the prediction only claimed some would cross
// further INTO risk, not that all of them would stay there). "Correct" is
// literal: the prediction just said "at least part of these customers",
// so any crossing at all confirms it; zero crossings AND a majority
// recovered is the clearest sign the prediction over-called the risk.
export const checkPrediction = async ({ accountId, prediction, db = prisma, now = new Date() }) => {
    const customerIds = prediction.predictedData?.at_risk_customer_ids || [];
    const churnedRatioThreshold = Number(prediction.predictedData?.churned_ratio_threshold ?? CHURNED_RATIO_MIN);

    if (customerIds.length === 0) {
        return { outcome: "inconclusive", actualData: { checked_customers: 0 }, notes: "La predicción no registró clientes específicos para volver a evaluar." };
    }

    const profiles = await computeCustomerRiskProfiles({ accountId, db, now, customerIds });
    const stillTracked = new Map(profiles.map((p) => [p.customerId, p]));

    let crossed = 0;
    let recovered = 0;
    let stillAtRisk = 0;
    let noLongerTracked = 0;
    for (const customerId of customerIds) {
        const profile = stillTracked.get(customerId);
        if (!profile) {
            noLongerTracked += 1; // e.g. deleted/merged customer since
            continue;
        }
        if (profile.riskRatio >= churnedRatioThreshold) crossed += 1;
        else if (profile.riskRatio < RISK_RATIO_MIN) recovered += 1;
        else stillAtRisk += 1;
    }

    const actualData = {
        customers_checked: customerIds.length,
        crossed_to_churned: crossed,
        recovered: recovered,
        still_at_risk: stillAtRisk,
        no_longer_tracked: noLongerTracked,
    };

    if (crossed > 0) {
        return { outcome: "correct", actualData, notes: `${crossed} de ${customerIds.length} clientes cruzaron al umbral de inactividad total.` };
    }
    if (recovered >= Math.ceil(customerIds.length / 2)) {
        return { outcome: "incorrect", actualData, notes: "La mayoría de los clientes señalados volvieron a comprar y salieron de la zona de riesgo." };
    }
    return { outcome: "inconclusive", actualData, notes: "Ningún cliente cruzó todavía a inactividad total, pero tampoco se recuperó una mayoría." };
};

const MIN_PRIOR_YEARS_PER_CUSTOMER = 2;
const MIN_CUSTOMERS_WITH_HISTORY = 3;
// A customer counts as "also quiet this month historically" if they had no
// order in this calendar month in at least half their prior years - a
// customer who reliably buys every single year in this exact month, but
// didn't this year, is evidence AGAINST "es temporada baja", not for it.
const QUIET_YEAR_SHARE_FOR_HISTORICAL_QUIET = 0.5;
const SUPPORTED_THRESHOLD = 0.6;
const CONTRADICTED_THRESHOLD = 0.3;

// Mission case G's own worked example: "la explicación actual del problema
// es X [estacional], pero al analizar los casos históricos encontramos
// mayor evidencia para Y". Only fires when a user tags their explanation
// "seasonal" (discoveryExplanation.service.js dispatches here) - checks,
// for the SAME at-risk customers this Discovery already named, whether
// they were ALSO quiet in this exact calendar month in prior years. This
// is the one thing this detector can check that a recurrence-only
// perception-gap can't: it answers the question the moment the explanation
// is given, not weeks later.
export const checkSeasonalExplanation = async ({ accountId, customerIds, db = prisma, now = new Date() }) => {
    if (!customerIds?.length) {
        return { outcome: "inconclusive", customers_with_history: 0, notes: "Este descubrimiento no tiene clientes específicos asociados para comparar." };
    }

    const orders = await db.order.findMany({
        where: { createdById: accountId, customerId: { in: customerIds }, orderStatus: { not: "cancelled" } },
        select: { customerId: true, orderDate: true },
    });

    const currentMonth = now.getUTCMonth();
    const currentYear = now.getUTCFullYear();

    const byCustomer = new Map();
    for (const order of orders) {
        const list = byCustomer.get(order.customerId) || [];
        list.push(new Date(order.orderDate));
        byCustomer.set(order.customerId, list);
    }

    let customersWithHistory = 0;
    let historicallyQuietToo = 0;
    for (const customerId of customerIds) {
        const dates = byCustomer.get(customerId) || [];
        const priorYears = new Set(dates.map((d) => d.getUTCFullYear()).filter((y) => y < currentYear));
        if (priorYears.size < MIN_PRIOR_YEARS_PER_CUSTOMER) continue;

        customersWithHistory += 1;
        let quietYears = 0;
        for (const year of priorYears) {
            const hadOrderThatMonth = dates.some((d) => d.getUTCFullYear() === year && d.getUTCMonth() === currentMonth);
            if (!hadOrderThatMonth) quietYears += 1;
        }
        if (quietYears / priorYears.size >= QUIET_YEAR_SHARE_FOR_HISTORICAL_QUIET) historicallyQuietToo += 1;
    }

    if (customersWithHistory < MIN_CUSTOMERS_WITH_HISTORY) {
        return {
            outcome: "inconclusive",
            customers_with_history: customersWithHistory,
            customers_checked: customerIds.length,
            notes: "Todavía no hay suficiente historial de varios años para estos clientes como para evaluar si esto es estacional.",
        };
    }

    const supportRatioPct = round1((historicallyQuietToo / customersWithHistory) * 100);
    const outcome = supportRatioPct >= SUPPORTED_THRESHOLD * 100 ? "supported" : supportRatioPct <= CONTRADICTED_THRESHOLD * 100 ? "contradicted" : "inconclusive";

    const notes =
        outcome === "supported"
            ? "La mayoría de estos clientes también estuvieron inactivos en este mismo mes en años anteriores - la explicación de temporada baja tiene respaldo en el historial."
            : outcome === "contradicted"
            ? "La mayoría de estos clientes normalmente SÍ compraban en este mismo mes en años anteriores - el historial no respalda que sea temporada baja, podría estar pasando algo distinto."
            : "El historial está dividido - ni respalda claramente ni contradice claramente que sea temporada baja.";

    return {
        outcome,
        support_ratio_pct: supportRatioPct,
        customers_with_history: customersWithHistory,
        customers_checked: customerIds.length,
        notes,
    };
};
