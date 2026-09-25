// Backend/utils/prepaidExpenseScheduler.js
//
// Runs daily: amortizes every active PrepaidExpense (diferido) with months
// due but not yet posted - see prepaidExpense.service.js for the posting
// logic and dedupe rule (same idiom as fixedAssetDepreciationScheduler.js).

import cron from "node-cron";
import { generateDuePrepaidAmortizations } from "../services/prepaidExpense.service.js";

class PrepaidExpenseScheduler {
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

        // After the fixed-asset depreciation slot (08:30) - no other
        // relationship, just not the same instant.
        this.task = cron.schedule("45 8 * * *", async () => {
            console.log("[prepaid-expense-scheduler] Checking due prepaid expense amortizations...");
            try {
                const result = await generateDuePrepaidAmortizations();
                if (result.posted > 0 || result.failed > 0) {
                    console.log(`[prepaid-expense-scheduler] Checked ${result.checked}, posted ${result.posted}, failed ${result.failed}.`);
                }
            } catch (err) {
                console.error("[prepaid-expense-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[prepaid-expense-scheduler] Started. Runs daily at 08:45 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return generateDuePrepaidAmortizations();
    }
}

export default new PrepaidExpenseScheduler();
