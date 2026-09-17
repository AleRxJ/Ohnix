// Backend/utils/recurringJournalScheduler.js
//
// Runs daily: posts one journal entry per active RecurringJournalTemplate
// whose configured day-of-month has arrived and that hasn't already posted
// for the current calendar month - see recurringJournal.service.js for the
// posting logic and dedupe rule (identical idiom to
// recurringExpenseScheduler.js).

import cron from "node-cron";
import { generateDueRecurringJournals } from "../services/recurringJournal.service.js";

class RecurringJournalScheduler {
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

        // Runs after the fixed-asset depreciation scheduler's 8:30 AM slot
        // so neither contends for the same instant - no other relationship.
        this.task = cron.schedule("45 8 * * *", async () => {
            console.log("[recurring-journal-scheduler] Checking due recurring journal templates...");
            try {
                const result = await generateDueRecurringJournals();
                if (result.posted > 0 || result.failed > 0) {
                    console.log(`[recurring-journal-scheduler] Checked ${result.checked}, posted ${result.posted}, failed ${result.failed}.`);
                }
            } catch (err) {
                console.error("[recurring-journal-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[recurring-journal-scheduler] Started. Runs daily at 08:45 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return generateDueRecurringJournals();
    }
}

export default new RecurringJournalScheduler();
