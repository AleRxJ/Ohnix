// Backend/utils/discoveryScheduler.js
//
// Runs nightly, two steps:
//   1. Executes every registered discovery detector for every account that
//      has real activity, upserting Discovery rows (see
//      discoveryEngine.service.js#upsertDiscovery for the dedupe rule that
//      keeps this from re-raising the same finding every night).
//   2. Checks any DiscoveryPrediction whose checkAfter date has arrived
//      against real data (discoveryLearning.service.js - Fase 4's
//      "predicción → resultado real → aprendizaje" loop).
// Discovery is inherently a "ran overnight" thing (mission section 4:
// "Ohnix estuvo trabajando mientras yo no estaba"), same one-file-per-job
// cron pattern as the other schedulers in this file's directory.

import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { runSalesVsCashGapDetector } from "../services/detectors/salesVsCashGap.detector.js";
import { runCustomerChurnRiskDetector } from "../services/detectors/customerChurnRisk.detector.js";
import { runCustomerProductLookalikeDetector } from "../services/detectors/customerProductLookalike.detector.js";
import { runSupplierDelayConnectionDetector } from "../services/detectors/supplierDelayConnection.detector.js";
import { runTrajectoryShiftDetector } from "../services/detectors/trajectoryShift.detector.js";
import { runNewPatternReturnRateDetector } from "../services/detectors/newPatternReturnRate.detector.js";
import { runCrossFactorCorrelationDetector } from "../services/detectors/crossFactorCorrelation.detector.js";
import { writeEinvoiceRejectionRateMetric } from "../services/metrics/einvoiceRejectionRate.metric.js";
import { writeMonthlyPurchaseSpendMetric } from "../services/metrics/monthlyPurchaseSpend.metric.js";
import { checkDuePredictions } from "../services/discoveryLearning.service.js";

// New detectors register here as Fase 2 adds them - each just needs to
// accept { accountId } and return { discovery, created }.
const DETECTORS = [
    runSalesVsCashGapDetector,
    runCustomerChurnRiskDetector,
    runCustomerProductLookalikeDetector,
    runSupplierDelayConnectionDetector,
    runTrajectoryShiftDetector,
    runNewPatternReturnRateDetector,
    runCrossFactorCorrelationDetector,
];

// Runs BEFORE the detectors above, once per account, so their
// MetricSnapshot writes are fresh when trajectoryShift.detector.js's
// generic "scan whatever else is in MetricSnapshot" pass runs this same
// tick. A future module gets covered by the Discovery Engine by adding
// itself here - a one-line registration, not a new detector - see
// services/metrics/einvoiceRejectionRate.metric.js's header comment for
// the exact shape a new entry should take.
const METRIC_WRITERS = [writeEinvoiceRejectionRateMetric, writeMonthlyPurchaseSpendMetric];

// "Has activity" is approximated by "has placed at least one Order ever",
// so brand-new/empty accounts aren't scanned for nothing every night.
// Discovery Engine is a Negocio+ feature (PLAN_FEATURES.discoveryEngine,
// pricing.middleware.js) - same subscription filter lowStockScheduler.js's
// getEligibleUsers() already uses for its own growth+ cutoff, so Starter
// accounts never burn nightly compute on a feature they can't see.
const getActiveAccountIds = async () => {
    const rows = await prisma.order.findMany({
        distinct: ["createdById"],
        where: { createdBy: { subscription: { status: "active", plan: { not: "starter" } } } },
        select: { createdById: true },
    });
    return rows.map((r) => r.createdById);
};

export const runDiscoveryEngineOnce = async () => {
    const accountIds = await getActiveAccountIds();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let metricWritersFailed = 0;

    for (const accountId of accountIds) {
        for (const writeMetric of METRIC_WRITERS) {
            try {
                await writeMetric({ accountId });
            } catch (err) {
                metricWritersFailed += 1;
                console.error(`[discovery-scheduler] metric writer failed for account ${accountId}:`, err?.message);
            }
        }

        for (const detector of DETECTORS) {
            try {
                const result = await detector({ accountId });
                // Most detectors return one { discovery, created } outcome;
                // supplierDelayConnection can flag several suppliers in one
                // run and returns a `discoveries` array instead - normalize
                // both shapes so the tally below counts every one of them.
                const outcomes = result.discoveries || (result.discovery ? [result] : []);
                if (outcomes.length === 0) skipped += 1;
                for (const outcome of outcomes) {
                    if (outcome.created) created += 1;
                    else updated += 1;
                }
            } catch (err) {
                failed += 1;
                console.error(`[discovery-scheduler] detector failed for account ${accountId}:`, err?.message);
            }
        }
    }

    // Runs after the whole per-account loop above, which already survived
    // whatever individual detectors/writers failed - a DB hiccup landing
    // exactly here must not throw away those real created/updated counts by
    // 500ing the entire response (see the commit that added this: a Neon
    // connectivity blip mid-run did exactly that during manual admin
    // testing of the /discovery-engine-run route).
    let learning = { due: 0, checked: 0, skippedNoChecker: 0, failed: 0, outcomeCounts: { correct: 0, incorrect: 0, inconclusive: 0 } };
    try {
        learning = await checkDuePredictions();
    } catch (err) {
        console.error("[discovery-scheduler] checkDuePredictions failed:", err?.message);
        learning = { ...learning, error: err?.message || String(err) };
    }

    return { accounts: accountIds.length, created, updated, skipped, failed, metricWritersFailed, learning };
};

class DiscoveryScheduler {
    constructor() {
        this.task = null;
        // In-memory only (not persisted) - same tradeoff the other
        // schedulers in this file's directory make: good enough for an
        // admin checking "did last night's run go OK" via /scheduler/status
        // without needing to grep Render logs, reset on every deploy/restart.
        this.lastRunAt = null;
        this.lastResult = null;
    }

    // Shared by the cron tick and the manual /discovery-engine-run trigger
    // so both record the same lastRunAt/lastResult bookkeeping - a manual
    // run during testing/demo should update "when did this last run" just
    // as much as the real nightly one does.
    async _runAndRecord() {
        try {
            const result = await runDiscoveryEngineOnce();
            this.lastRunAt = new Date();
            this.lastResult = result;
            return result;
        } catch (err) {
            this.lastRunAt = new Date();
            this.lastResult = { error: err?.message || String(err) };
            throw err;
        }
    }

    start() {
        if (this.task) return;

        const timezone = (() => {
            const tz = process.env.TIMEZONE || "America/Bogota";
            try {
                Intl.DateTimeFormat("en-US", { timeZone: tz });
                return tz;
            } catch {
                return "UTC";
            }
        })();

        // 04:30, after the recurring-expense/receipt-tacita slots, well
        // before business hours.
        this.task = cron.schedule("30 4 * * *", async () => {
            console.log("[discovery-scheduler] Running discovery engine...");
            try {
                const result = await this._runAndRecord();
                console.log(
                    `[discovery-scheduler] accounts=${result.accounts} created=${result.created} updated=${result.updated} skipped=${result.skipped} failed=${result.failed} metricWritersFailed=${result.metricWritersFailed}`
                );
                console.log(
                    `[discovery-scheduler] learning: due=${result.learning.due} checked=${result.learning.checked} failed=${result.learning.failed}`
                );
                // A detector failing for every account (a real bug, not a
                // one-off) would otherwise only ever show up to whoever
                // happens to be reading Render logs that night - this is the
                // one signal that reaches /scheduler/status too.
                if (result.failed > 0) {
                    console.error(`[discovery-scheduler] ${result.failed} detector run(s) failed - see errors above.`);
                }
            } catch (err) {
                console.error("[discovery-scheduler] Error during nightly run:", err?.message);
            }
        }, { timezone });

        console.log(`[discovery-scheduler] Started. Runs daily at 04:30 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing/demo - see routes/scheduler.routes.js.
    async runNow() {
        return this._runAndRecord();
    }

    // Mirrors lowStockScheduler#getStatus's shape (isRunning/nextRun) so
    // admins get the same "is this actually alive" signal for both
    // schedulers, plus lastRunAt/lastResult so a failed or stuck nightly run
    // is visible from /scheduler/status instead of only in server logs.
    getStatus() {
        return {
            isRunning: Boolean(this.task),
            nextRun: this.task && typeof this.task.getNextRun === "function" ? this.task.getNextRun() : null,
            lastRunAt: this.lastRunAt,
            lastResult: this.lastResult,
        };
    }
}

export default new DiscoveryScheduler();
