// Backend/utils/recurringExpenseScheduler.js
//
// Runs daily: posts one journal entry per active RecurringExpenseTemplate
// whose configured day-of-month has arrived and that hasn't already posted
// for the current calendar month - see recurringExpense.service.js for the
// actual posting logic and dedupe rule.

import cron from "node-cron";
import { generateDueRecurringExpenses } from "../services/recurringExpense.service.js";

class RecurringExpenseScheduler {
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

        // Runs after the renewal scheduler's 8:00 AM slot so both don't
        // contend for the same instant - no other relationship between them.
        this.task = cron.schedule("15 8 * * *", async () => {
            console.log("[recurring-expense-scheduler] Checking due recurring expenses...");
            try {
                const result = await generateDueRecurringExpenses();
                if (result.posted > 0 || result.failed > 0) {
                    console.log(`[recurring-expense-scheduler] Checked ${result.checked}, posted ${result.posted}, failed ${result.failed}.`);
                }
            } catch (err) {
                console.error("[recurring-expense-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[recurring-expense-scheduler] Started. Runs daily at 08:15 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return generateDueRecurringExpenses();
    }
}

export default new RecurringExpenseScheduler();
