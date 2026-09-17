// Mission case 2: "Encontré 143 clientes que se parecen a tus clientes más
// rentables pero nunca han comprado X." Finds the product that top
// (highest lifetime value) customers buy disproportionately more than the
// rest of the customer base, then flags customers whose spending profile
// (average order value) resembles that top cohort but who have never
// bought it - an expansion audience nobody was asking about, not a
// trivial "customers who bought X also bought Y" cross-sell rule.
//
// Deliberately rule-based, not a black-box similarity score (mission
// section 12, "no caja negra"): "similar" is defined purely by average
// order value falling in the same range as the top cohort's median -
// anyone looking at a flagged customer can see exactly why they qualified.
// No prediction is registered here (unlike the other two detectors) - there
// is no outreach/campaign log in this system yet to check a "did they buy
// after we told them" prediction against, and inventing one would violate
// the "no predicciones sin evidencia" rule.

import { prisma } from "../../db/prisma.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";

export const DETECTOR_KEY = "customer_product_lookalike";

const MIN_ORDERS_FOR_PROFILE = 2;
const TOP_CUSTOMER_FRACTION = 0.2;
const MIN_TOP_CUSTOMERS = 5;
const MIN_TOP_COVERAGE_PCT = 40; // the product must be common among top customers
const MAX_OVERALL_COVERAGE_PCT = 65; // ...but not already ubiquitous account-wide
const MIN_LIFT = 1.4;
const MIN_LOOKALIKE_COUNT = 5;
// A lookalike's average order value must fall within this band of the top
// cohort's median AOV - wide enough to catch real similarity, narrow
// enough that "similar" still means something.
const AOV_SIMILARITY_BAND = [0.5, 2.0];
const MAX_LISTED_CUSTOMERS = 25;

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const runCustomerProductLookalikeDetector = async ({ accountId, db = prisma }) => {
    const orders = await db.order.findMany({
        where: { createdById: accountId, orderStatus: { not: "cancelled" } },
        select: { customerId: true, total: true, orderDetails: { select: { productId: true } } },
    });

    const byCustomer = new Map();
    for (const order of orders) {
        const profile = byCustomer.get(order.customerId) || { orderCount: 0, revenue: 0, productIds: new Set() };
        profile.orderCount += 1;
        profile.revenue += Number(order.total);
        for (const detail of order.orderDetails) profile.productIds.add(detail.productId);
        byCustomer.set(order.customerId, profile);
    }

    const profiles = [...byCustomer.entries()]
        .map(([customerId, p]) => ({
            customerId,
            orderCount: p.orderCount,
            revenue: p.revenue,
            avgOrderValue: p.revenue / p.orderCount,
            productIds: p.productIds,
        }))
        .filter((p) => p.orderCount >= MIN_ORDERS_FOR_PROFILE);

    if (profiles.length < MIN_TOP_CUSTOMERS * 2) {
        return { discovery: null, created: false, reason: "insufficient_customer_base", customerCount: profiles.length };
    }

    const topCount = Math.max(MIN_TOP_CUSTOMERS, Math.round(profiles.length * TOP_CUSTOMER_FRACTION));
    const topCustomers = [...profiles].sort((a, b) => b.revenue - a.revenue).slice(0, topCount);

    // Product coverage: what share of top customers bought each product,
    // vs. what share of the whole qualifying customer base did.
    const topProductCounts = new Map();
    for (const c of topCustomers) {
        for (const productId of c.productIds) topProductCounts.set(productId, (topProductCounts.get(productId) || 0) + 1);
    }
    const overallProductCounts = new Map();
    for (const c of profiles) {
        for (const productId of c.productIds) overallProductCounts.set(productId, (overallProductCounts.get(productId) || 0) + 1);
    }

    let bestCandidate = null;
    for (const [productId, topHits] of topProductCounts.entries()) {
        const topCoveragePct = (topHits / topCustomers.length) * 100;
        if (topCoveragePct < MIN_TOP_COVERAGE_PCT) continue;
        const overallHits = overallProductCounts.get(productId) || 0;
        const overallCoveragePct = (overallHits / profiles.length) * 100;
        if (overallCoveragePct > MAX_OVERALL_COVERAGE_PCT) continue;
        const lift = overallCoveragePct > 0 ? topCoveragePct / overallCoveragePct : Infinity;
        if (lift < MIN_LIFT) continue;
        if (!bestCandidate || lift > bestCandidate.lift) {
            bestCandidate = { productId, topCoveragePct, overallCoveragePct, lift };
        }
    }

    if (!bestCandidate) {
        return { discovery: null, created: false, reason: "no_signature_product_found" };
    }

    const topAovMedian = median(topCustomers.map((c) => c.avgOrderValue));
    const [lowBand, highBand] = AOV_SIMILARITY_BAND;

    const lookalikes = profiles.filter(
        (c) =>
            !c.productIds.has(bestCandidate.productId) &&
            c.avgOrderValue >= topAovMedian * lowBand &&
            c.avgOrderValue <= topAovMedian * highBand
    );

    if (lookalikes.length < MIN_LOOKALIKE_COUNT) {
        return { discovery: null, created: false, reason: "not_enough_lookalikes", candidateCount: lookalikes.length };
    }

    const product = await db.product.findUnique({ where: { id: bestCandidate.productId }, select: { id: true, productName: true } });
    const customerNames = await db.customer.findMany({ where: { id: { in: lookalikes.map((c) => c.customerId) } }, select: { id: true, name: true } });
    const nameById = new Map(customerNames.map((c) => [c.id, c.name]));

    // Sizing reference: the real, already-observed lifetime revenue of top
    // customers who DID buy this product - not an invented conversion-rate
    // estimate.
    const topBuyersOfProduct = topCustomers.filter((c) => c.productIds.has(bestCandidate.productId));
    const avgTopBuyerRevenue = topBuyersOfProduct.length
        ? topBuyersOfProduct.reduce((sum, c) => sum + c.revenue, 0) / topBuyersOfProduct.length
        : 0;

    const impact = Math.min(1, (bestCandidate.lift - MIN_LIFT) / 3 + lookalikes.length / 100);
    const confidence = Math.min(0.75, 0.35 + (Math.min(topCustomers.length, 30) / 30) * 0.2 + (Math.min(bestCandidate.lift, 5) / 5) * 0.2);
    const urgency = 0.3; // opportunities are rarely time-critical the way risks/contradictions are
    const novelty = 0.6;
    const reversibility = 0.85; // acting on it (or not) carries little downside either way

    const sortedLookalikes = [...lookalikes].sort((a, b) => b.revenue - a.revenue);
    const productLabel = product?.productName || bestCandidate.productId;

    const { discovery, created } = await upsertDiscovery({
        accountId,
        detectorKey: DETECTOR_KEY,
        type: "opportunity",
        dedupeKey: `${DETECTOR_KEY}:account:${bestCandidate.productId}`,
        title: `${lookalikes.length} clientes se parecen a tus clientes más rentables, pero nunca han comprado "${productLabel}"`,
        summary: `El ${round1(bestCandidate.topCoveragePct)}% de tus clientes más rentables ha comprado "${productLabel}", frente a solo ${round1(bestCandidate.overallCoveragePct)}% del resto de la base de clientes (${round1(bestCandidate.lift)}x más frecuente entre los mejores clientes). Encontré ${lookalikes.length} clientes con un ticket promedio similar al de ese grupo top que todavía no lo han comprado.`,
        hypothesis: "Un ticket promedio parecido al de los clientes más rentables sugiere una capacidad de gasto/necesidad similar - la ausencia de este producto en su historial podría ser desconocimiento más que falta de interés real.",
        unknowns: "No sabemos si estos clientes ya conocen el producto y lo rechazaron, si lo compran en otro lugar, o simplemente nunca se los ha ofrecido - esto es una lista priorizada para investigar/ofrecer, no una garantía de conversión.",
        recommendation: `Priorizar a estos clientes en la próxima campaña o sugerencia de venta para "${productLabel}", empezando por los de mayor valor histórico.`,
        scores: { impact, novelty, urgency, confidence, reversibility },
        entityCount: lookalikes.length,
        patternSince: null,
        evidence: [
            {
                kind: "comparison",
                label: "Cobertura del producto: clientes top vs. resto de la base",
                data: {
                    product_id: bestCandidate.productId,
                    product_name: product?.productName || null,
                    top_customers_count: topCustomers.length,
                    top_coverage_pct: round1(bestCandidate.topCoveragePct),
                    overall_coverage_pct: round1(bestCandidate.overallCoveragePct),
                    lift: round2(bestCandidate.lift),
                },
                sourceType: "product",
                sourceId: bestCandidate.productId,
            },
            {
                kind: "cohort_sample",
                label: "Clientes similares que nunca han comprado este producto",
                data: sortedLookalikes.slice(0, MAX_LISTED_CUSTOMERS).map((c) => ({
                    customer_id: c.customerId,
                    customer_name: nameById.get(c.customerId) || null,
                    avg_order_value: round2(c.avgOrderValue),
                    order_count: c.orderCount,
                    lifetime_value: round2(c.revenue),
                })),
                sourceType: "customer",
                sourceId: null,
            },
            {
                kind: "metric",
                label: "Referencia: clientes top que sí compraron este producto",
                data: {
                    top_buyers_of_product: topBuyersOfProduct.length,
                    avg_lifetime_revenue_among_top_buyers: round2(avgTopBuyerRevenue),
                    top_cohort_median_avg_order_value: round2(topAovMedian),
                },
                sourceType: null,
                sourceId: null,
            },
        ],
        entities: [
            { entityType: "product", entityId: bestCandidate.productId, role: "opportunity_product", metadata: { lift: round2(bestCandidate.lift) } },
            ...lookalikes.map((c) => ({
                entityType: "customer",
                entityId: c.customerId,
                role: "lookalike_opportunity",
                metadata: { avg_order_value: round2(c.avgOrderValue), order_count: c.orderCount, lifetime_value: round2(c.revenue) },
            })),
        ],
        predictions: [],
        db,
    });

    return { discovery, created, bestCandidate, lookalikes, topCustomers };
};
