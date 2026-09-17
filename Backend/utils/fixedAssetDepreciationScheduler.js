// Backend/utils/fixedAssetDepreciationScheduler.js
//
// Runs daily: posts one journal entry per active FixedAsset that hasn't
// already depreciated for the current calendar month and isn't fully
// depreciated yet - see fixedAsset.service.js for the posting logic and
// dedupe rule (identical idiom to recurringExpenseScheduler.js).

import cron from "node-cron";
import { generateDueFixedAssetDepreciation } from "../services/fixedAsset.service.js";

class FixedAssetDepreciationScheduler {
    constructor() {
        this.task = null;
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

        // Runs after the recurring-expense scheduler's 8:15 AM slot so both
        // don't contend for the same instant - no other relationship.
        this.task = cron.schedule("30 8 * * *", async () => {
            console.log("[fixed-asset-depreciation-scheduler] Checking due fixed asset depreciation...");
            try {
                const result = await generateDueFixedAssetDepreciation();
                if (result.posted > 0 || result.failed > 0) {
                    console.log(`[fixed-asset-depreciation-scheduler] Checked ${result.checked}, posted ${result.posted}, failed ${result.failed}.`);
                }
            } catch (err) {
                console.error("[fixed-asset-depreciation-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[fixed-asset-depreciation-scheduler] Started. Runs daily at 08:30 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return generateDueFixedAssetDepreciation();
    }
}

export default new FixedAssetDepreciationScheduler();
