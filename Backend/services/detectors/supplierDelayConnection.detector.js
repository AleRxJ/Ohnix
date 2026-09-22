// Mission case 5 ("conexiones inesperadas"): "Los retrasos de este
// proveedor y la pérdida de clientes aparecen relacionados bajo
// determinadas condiciones." This is the one detector in the engine that
// genuinely crosses domains end-to-end: supplier + purchases (delivery
// timing) + product (what that supplier supplies) + customer + orders
// (who stopped buying those products, and after when).
//
// The rigor mission section 8 asks for ("no confundir correlación con
// causalidad... comparación de cohortes, controles") is not cosmetic here -
// this detector always computes a CONTROL rate (how often customers of
// products from OTHER suppliers go quiet over the same two windows) before
// it will say a supplier's slower deliveries and its customers going quiet
// look related. No control comparison, no discovery.

import { prisma } from "../../db/prisma.js";
import { upsertDiscovery } from "../discoveryEngine.service.js";
import { resolveIsEnglish } from "../discoveryLocale.service.js";

export const DETECTOR_KEY = "supplier_delay_customer_connection";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 120;
const MIN_PURCHASES_PER_WINDOW = 2;
const MIN_DELAY_INCREASE_DAYS = 5;
const MIN_RECENT_AVG_DELAY_DAYS = 3;
const MIN_CUSTOMERS_HAD_PRIOR = 5;
const MIN_WENT_QUIET_RATIO = 1.5;
const MIN_ABS_DIFF_PCT = 15;
const MAX_LISTED_CUSTOMERS = 25;

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

// Pure computation, shared by the detector and by its checkPrediction (Fase
// 4): returns one candidate per supplier whose delivery delay increased AND
// whose product buyers went quiet meaningfully more than the account-wide
// control rate over the same two windows. Returns [] when nothing clears
// every bar - mission rule 5, no forced finding.
export const computeSupplierDelayConnections = async ({ accountId, db = prisma, now = new Date() }) => {
    const recentStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const priorStart = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);

    const [purchases, orders] = await Promise.all([
        db.purchase.findMany({
            where: { createdById: accountId, purchaseStatus: "completed", dueDate: { not: null }, purchaseDate: { gte: priorStart, lt: now } },
            select: { supplierId: true, dueDate: true, updatedAt: true, purchaseDetails: { select: { productId: true } } },
        }),
        db.order.findMany({
            where: { createdById: accountId, orderStatus: { not: "cancelled" }, orderDate: { gte: priorStart, lt: now } },
            select: { customerId: true, orderDate: true, orderDetails: { select: { productId: true } } },
        }),
    ]);

    const bySupplier = new Map();
    for (const purchase of purchases) {
        const delayDays = (new Date(purchase.updatedAt) - new Date(purchase.dueDate)) / DAY_MS;
        const bucket = new Date(purchase.dueDate) >= recentStart ? "recent" : "prior";
        const entry = bySupplier.get(purchase.supplierId) || { recent: [], prior: [], productIds: new Set() };
        entry[bucket].push(delayDays);
        for (const detail of purchase.purchaseDetails) entry.productIds.add(detail.productId);
        bySupplier.set(purchase.supplierId, entry);
    }

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const candidateSuppliers = [];
    for (const [supplierId, entry] of bySupplier.entries()) {
        if (entry.prior.length < MIN_PURCHASES_PER_WINDOW || entry.recent.length < MIN_PURCHASES_PER_WINDOW) continue;
        const priorAvgDelay = avg(entry.prior);
        const recentAvgDelay = avg(entry.recent);
        const delayIncrease = recentAvgDelay - priorAvgDelay;
        if (recentAvgDelay < MIN_RECENT_AVG_DELAY_DAYS || delayIncrease < MIN_DELAY_INCREASE_DAYS) continue;
        candidateSuppliers.push({ supplierId, priorAvgDelay, recentAvgDelay, delayIncrease, productIds: entry.productIds, purchasesRecent: entry.recent.length, purchasesPrior: entry.prior.length });
    }

    if (candidateSuppliers.length === 0) return [];

    // "Went quiet": ordered at least one of the relevant products in the
    // prior window, but none of them in the recent window - computed once
    // per (customer, product-set) pair, reused for both the treatment group
    // (a supplier's own product buyers) and the control group (everyone
    // else's).
    const wentQuietRate = (productIdSet) => {
        const hadPrior = new Set();
        const hadRecent = new Set();
        for (const order of orders) {
            const touchesSet = order.orderDetails.some((d) => productIdSet.has(d.productId));
            if (!touchesSet) continue;
            const date = new Date(order.orderDate);
            if (date >= priorStart && date < recentStart) hadPrior.add(order.customerId);
            else if (date >= recentStart) hadRecent.add(order.customerId);
        }
        const wentQuiet = [...hadPrior].filter((customerId) => !hadRecent.has(customerId));
        return { hadPriorCount: hadPrior.size, wentQuietCount: wentQuiet.length, wentQuietCustomerIds: wentQuiet, ratePct: hadPrior.size ? (wentQuiet.length / hadPrior.size) * 100 : null };
    };

    const results = [];
    for (const candidate of candidateSuppliers) {
        const treatment = wentQuietRate(candidate.productIds);
        if (treatment.hadPriorCount < MIN_CUSTOMERS_HAD_PRIOR || treatment.ratePct === null) continue;

        const controlProductIds = new Set();
        for (const order of orders) {
            for (const detail of order.orderDetails) {
                if (!candidate.productIds.has(detail.productId)) controlProductIds.add(detail.productId);
            }
        }
        const control = wentQuietRate(controlProductIds);
        if (control.ratePct === null) continue;

        const ratio = control.ratePct > 0 ? treatment.ratePct / control.ratePct : treatment.ratePct > 0 ? Infinity : 0;
        const absDiff = treatment.ratePct - control.ratePct;
        if (ratio < MIN_WENT_QUIET_RATIO || absDiff < MIN_ABS_DIFF_PCT) continue;

        results.push({ ...candidate, treatment, control, ratio, absDiff });
    }

    return results;
};

export const runSupplierDelayConnectionDetector = async ({ accountId, db = prisma, now = new Date() }) => {
    const connections = await computeSupplierDelayConnections({ accountId, db, now });
    if (connections.length === 0) {
        return { discovery: null, created: false, reason: "no_connection_found" };
    }

    // One Discovery per qualifying supplier - each is its own distinct,
    // independently actionable finding, not a single "N suppliers" rollup.
    const outcomes = [];
    for (const connection of connections) {
        const supplier = await db.supplier.findUnique({ where: { id: connection.supplierId }, select: { id: true, name: true } });
        const customerNames = await db.customer.findMany({
            where: { id: { in: connection.treatment.wentQuietCustomerIds } },
            select: { id: true, name: true },
        });
        const nameById = new Map(customerNames.map((c) => [c.id, c.name]));
        const supplierLabel = supplier?.name || connection.supplierId;

        const impact = Math.min(1, connection.absDiff / 40);
        const urgency = Math.min(1, connection.delayIncrease / 20);
        const confidence = Math.min(0.7, 0.3 + Math.min(connection.ratio, 4) / 4 * 0.25 + Math.min(connection.treatment.hadPriorCount, 30) / 30 * 0.15);
        const novelty = 0.65; // this is the cross-domain "nobody wired these two tables together" case
        const reversibility = 0.5; // depends on renegotiating with the supplier / diversifying, not trivial but not structural either

        const isEN = await resolveIsEnglish({ accountId, db });
        const copy = isEN
            ? {
                  title: `"${supplierLabel}"'s delays and its customers leaving appear related`,
                  summary: `Supplier "${supplierLabel}" went from an average delay of ${round1(connection.priorAvgDelay)} to ${round1(connection.recentAvgDelay)} days in its most recent deliveries. Over the same period, ${round1(connection.treatment.ratePct)}% of customers who bought products from that supplier stopped buying them - vs. ${round1(connection.control.ratePct)}% across the rest of the customer base (${round1(connection.ratio)}x more). We don't know yet if one caused the other, but the two show up together under this condition.`,
                  hypothesis: "When a supplier keeps falling behind, the products that depend on it likely run into stockouts, and those stockouts could be pushing its regular customers to stop buying - a hypothesis, not confirmed causality.",
                  unknowns: "We haven't directly verified whether there were stockouts (this detector doesn't reconstruct inventory history yet), whether these customers bought the same product elsewhere, or whether they stopped buying for an unrelated reason.",
                  recommendation: `Review the recent stock level of products you buy from "${supplierLabel}" and consider an alternate supplier or a backup order while the delay gets resolved.`,
                  delayComparisonLabel: "Supplier delivery delay: before vs. now",
                  wentQuietComparisonLabel: "Customers who stopped buying: this supplier's products vs. control (rest of the base)",
                  cohortLabel: "This supplier's customers who stopped buying",
                  predictionStatement: `If "${supplierLabel}"'s delay continues, the gap between its inactive-customer rate and the rest of the base should hold or grow over the next 90 days.`,
              }
            : {
                  title: `Los retrasos de "${supplierLabel}" y la pérdida de sus clientes aparecen relacionados`,
                  summary: `El proveedor "${supplierLabel}" pasó de un atraso promedio de ${round1(connection.priorAvgDelay)} a ${round1(connection.recentAvgDelay)} días en sus últimas entregas. En el mismo periodo, ${round1(connection.treatment.ratePct)}% de los clientes que compraban productos de ese proveedor dejaron de comprarlos - frente a ${round1(connection.control.ratePct)}% en el resto de la base de clientes (${round1(connection.ratio)}x más). No sabemos todavía si una cosa causó la otra, pero las dos cosas aparecen juntas bajo esta condición.`,
                  hypothesis: "Cuando un proveedor se atrasa de forma sostenida, los productos que depende de él probablemente sufren quiebres de stock, y esos quiebres podrían estar empujando a sus clientes habituales a dejar de comprar - una hipótesis, no una causalidad confirmada.",
                  unknowns: "No hemos verificado directamente si hubo quiebres de stock (este detector no reconstruye el historial de inventario todavía), ni si estos clientes compraron el mismo producto en otro lugar, ni si dejaron de comprar por otra razón sin relación con este proveedor.",
                  recommendation: `Revisar el nivel de stock reciente de los productos que compras a "${supplierLabel}" y considerar un proveedor alterno o un pedido de respaldo mientras se resuelve el atraso.`,
                  delayComparisonLabel: "Atraso de entregas del proveedor: antes vs. ahora",
                  wentQuietComparisonLabel: "Clientes que dejaron de comprar: productos de este proveedor vs. control (resto de la base)",
                  cohortLabel: "Clientes de este proveedor que dejaron de comprar",
                  predictionStatement: `Si el atraso de "${supplierLabel}" continúa, la brecha entre su tasa de clientes inactivos y la del resto de la base debería mantenerse o crecer en los próximos 90 días.`,
              };

        const { discovery, created } = await upsertDiscovery({
            accountId,
            detectorKey: DETECTOR_KEY,
            type: "connection",
            dedupeKey: `${DETECTOR_KEY}:supplier:${connection.supplierId}`,
            title: copy.title,
            summary: copy.summary,
            hypothesis: copy.hypothesis,
            unknowns: copy.unknowns,
            recommendation: copy.recommendation,
            scores: { impact, novelty, urgency, confidence, reversibility },
            entityCount: connection.treatment.wentQuietCount,
            patternSince: recentStartFromNow(now),
            evidence: [
                {
                    kind: "comparison",
                    label: copy.delayComparisonLabel,
                    data: {
                        avg_delay_prior_days: round1(connection.priorAvgDelay),
                        avg_delay_recent_days: round1(connection.recentAvgDelay),
                        delay_increase_days: round1(connection.delayIncrease),
                        purchases_prior: connection.purchasesPrior,
                        purchases_recent: connection.purchasesRecent,
                    },
                    sourceType: "supplier",
                    sourceId: connection.supplierId,
                },
                {
                    kind: "comparison",
                    label: copy.wentQuietComparisonLabel,
                    data: {
                        went_quiet_pct_this_supplier: round1(connection.treatment.ratePct),
                        went_quiet_pct_control_group: round1(connection.control.ratePct),
                        ratio: round2(connection.ratio),
                        customers_considered_this_supplier: connection.treatment.hadPriorCount,
                        customers_considered_control: connection.control.hadPriorCount,
                    },
                    sourceType: null,
                    sourceId: null,
                },
                {
                    kind: "cohort_sample",
                    label: copy.cohortLabel,
                    data: connection.treatment.wentQuietCustomerIds.slice(0, MAX_LISTED_CUSTOMERS).map((customerId) => ({
                        customer_id: customerId,
                        customer_name: nameById.get(customerId) || null,
                    })),
                    sourceType: "customer",
                    sourceId: null,
                },
            ],
            entities: [
                { entityType: "supplier", entityId: connection.supplierId, role: "delayed_supplier", metadata: { delay_increase_days: round1(connection.delayIncrease) } },
                ...connection.treatment.wentQuietCustomerIds.map((customerId) => ({
                    entityType: "customer",
                    entityId: customerId,
                    role: "went_quiet_after_delay",
                    metadata: {},
                })),
            ],
            predictions: [
                {
                    statement: copy.predictionStatement,
                    predictedData: { supplier_id: connection.supplierId, went_quiet_gap_pct_at_prediction: round1(connection.absDiff) },
                    confidenceAtStake: confidence,
                    checkAfter: new Date(now.getTime() + 90 * DAY_MS),
                },
            ],
            db,
        });

        outcomes.push({ discovery, created, connection });
    }

    return { discoveries: outcomes, discovery: outcomes[0]?.discovery || null, created: outcomes.some((o) => o.created) };
};

function recentStartFromNow(now) {
    return new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
}

// Fase 4 learning loop: re-runs the same before/after + control comparison
// as of "now" for the specific supplier the prediction named, and checks
// whether the went-quiet gap it described held up.
export const checkPrediction = async ({ accountId, prediction, db = prisma, now = new Date() }) => {
    const supplierId = prediction.predictedData?.supplier_id;
    const gapAtPrediction = Number(prediction.predictedData?.went_quiet_gap_pct_at_prediction ?? 0);

    const isEN = await resolveIsEnglish({ accountId, db });

    if (!supplierId) {
        return {
            outcome: "inconclusive",
            actualData: {},
            notes: isEN ? "The prediction didn't record a specific supplier." : "La predicción no registró un proveedor específico.",
        };
    }

    const connections = await computeSupplierDelayConnections({ accountId, db, now });
    const stillFlagged = connections.find((c) => c.supplierId === supplierId);

    const actualData = {
        gap_pct_at_prediction: round1(gapAtPrediction),
        gap_pct_at_check: stillFlagged ? round1(stillFlagged.absDiff) : null,
        still_flagged: Boolean(stillFlagged),
    };

    if (stillFlagged && stillFlagged.absDiff >= gapAtPrediction * 0.5) {
        return {
            outcome: "correct",
            actualData,
            notes: isEN ? "The gap between this supplier and the control group held (or grew)." : "La brecha entre este proveedor y el grupo de control se mantuvo (o creció).",
        };
    }
    if (!stillFlagged) {
        return {
            outcome: "incorrect",
            actualData,
            notes: isEN
                ? "The supplier no longer meets the original conditions (the delay or the customer gap normalized)."
                : "El proveedor ya no cumple las condiciones originales (el atraso o la brecha de clientes se normalizó).",
        };
    }
    return {
        outcome: "inconclusive",
        actualData,
        notes: isEN
            ? "The gap narrowed partially - not a clear case of either a hit or a miss."
            : "La brecha se redujo de forma parcial - no es un caso claro de acierto ni de error.",
    };
};
