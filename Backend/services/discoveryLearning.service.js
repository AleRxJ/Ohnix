// Fase 4 - the "predicción → resultado real → error → aprendizaje" loop
// from mission section 9/10. Every night (see discoveryScheduler.js), this
// looks for DiscoveryPredictions whose checkAfter date has arrived, asks
// that prediction's own detector whether it panned out, and rolls the
// verdict into DiscoveryPatternStats so the NEXT time that detector fires,
// its confidence reflects how often it has actually been right before -
// not just how the current evidence looks in isolation.
//
// Each detector owns its own `checkPrediction` - the learning loop has no
// idea what a "gap_pct" or a "risk_ratio" means, it just dispatches by
// detectorKey and records whatever verdict comes back.

import { prisma } from "../db/prisma.js";
import { checkPrediction as checkSalesVsCashGapPrediction } from "./detectors/salesVsCashGap.detector.js";
import { checkPrediction as checkCustomerChurnRiskPrediction } from "./detectors/customerChurnRisk.detector.js";
import { checkPrediction as checkSupplierDelayConnectionPrediction } from "./detectors/supplierDelayConnection.detector.js";
import { checkPrediction as checkTrajectoryShiftPrediction } from "./detectors/trajectoryShift.detector.js";
import { checkPrediction as checkNewPatternReturnRatePrediction } from "./detectors/newPatternReturnRate.detector.js";
import { checkPrediction as checkCrossFactorCorrelationPrediction } from "./detectors/crossFactorCorrelation.detector.js";

const CHECKERS = {
    sales_vs_cash_gap: checkSalesVsCashGapPrediction,
    customer_churn_risk: checkCustomerChurnRiskPrediction,
    supplier_delay_customer_connection: checkSupplierDelayConnectionPrediction,
    trajectory_shift: checkTrajectoryShiftPrediction,
    new_pattern_return_rate: checkNewPatternReturnRatePrediction,
    cross_factor_correlation: checkCrossFactorCorrelationPrediction,
    // customer_product_lookalike registers no predictions (see its
    // detector's header comment) - nothing to check for that key.
};

// Laplace-smoothed accuracy rather than a raw ratio, so a detector's very
// first checked prediction doesn't swing straight to 0% or 100% confidence -
// starts at 0.5 (an uninformed prior) and moves gradually as more
// predictions get checked.
const smoothedConfidence = (correct, total) => Number(((correct + 1) / (total + 2)).toFixed(3));

const updatePatternStats = async ({ detectorKey, wasCorrect, db }) => {
    const existing = await db.discoveryPatternStats.findUnique({ where: { detectorKey } });
    const totalPredictions = (existing?.totalPredictions || 0) + 1;
    const correctPredictions = (existing?.correctPredictions || 0) + (wasCorrect ? 1 : 0);
    const currentConfidence = smoothedConfidence(correctPredictions, totalPredictions);

    await db.discoveryPatternStats.upsert({
        where: { detectorKey },
        update: { totalPredictions, correctPredictions, currentConfidence },
        create: { detectorKey, totalPredictions, correctPredictions, currentConfidence },
    });

    return { totalPredictions, correctPredictions, currentConfidence };
};

export const checkDuePredictions = async ({ db = prisma, now = new Date() } = {}) => {
    const due = await db.discoveryPrediction.findMany({
        where: { checkedAt: null, checkAfter: { lte: now } },
        include: { discovery: { select: { id: true, accountId: true, detectorKey: true, status: true } } },
    });

    let checked = 0;
    let skippedNoChecker = 0;
    let failed = 0;
    const outcomeCounts = { correct: 0, incorrect: 0, inconclusive: 0 };

    for (const prediction of due) {
        const checker = CHECKERS[prediction.discovery.detectorKey];
        if (!checker) {
            skippedNoChecker += 1;
            continue;
        }

        try {
            const { outcome, actualData, notes } = await checker({
                accountId: prediction.discovery.accountId,
                prediction,
                db,
                now,
            });

            await db.discoveryPrediction.update({
                where: { id: prediction.id },
                data: { checkedAt: now, actualData, outcome, notes },
            });

            // Every Discovery in Fase 2 registers exactly one prediction, so
            // checking it IS the discovery reaching "learned" - revisit this
            // 1:1 assumption if a future detector ever registers more than one.
            if (prediction.discovery.status !== "resolved" && prediction.discovery.status !== "dismissed") {
                await db.discovery.update({ where: { id: prediction.discovery.id }, data: { status: "learned" } });
            }

            // "inconclusive" means the check genuinely couldn't tell if the
            // detector was right or wrong - counting it as a miss (the old
            // behavior, wasCorrect = outcome === "correct") silently
            // punished a detector for producing an honest "unclear" instead
            // of a false "wrong". Only a clear correct/incorrect verdict
            // moves the accuracy estimate at all.
            if (outcome === "correct" || outcome === "incorrect") {
                await updatePatternStats({ detectorKey: prediction.discovery.detectorKey, wasCorrect: outcome === "correct", db });
            }

            checked += 1;
            outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
        } catch (err) {
            failed += 1;
            console.error(`[discovery-learning] failed to check prediction ${prediction.id}:`, err?.message);
        }
    }

    return { due: due.length, checked, skippedNoChecker, failed, outcomeCounts };
};
