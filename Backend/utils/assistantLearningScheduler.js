// Backend/utils/assistantLearningScheduler.js
//
// Runs daily: checks the assistant's guidance predictions whose checkAfter
// has arrived - did the accounting finding the assistant guided a company
// on actually go away? See assistantLearning.service.js for the loop itself
// (same idea as discoveryScheduler's nightly prediction check).

import cron from "node-cron";
import { checkDueGuidance } from "../services/assistantLearning.service.js";

class AssistantLearningScheduler {
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

        // After the accounting schedulers (08:30 depreciation, 08:45
        // recurring journals) so a guidance check sees this morning's
        // automatic postings, not yesterday's state.
        this.task = cron.schedule("15 9 * * *", async () => {
            try {
                const result = await checkDueGuidance();
                if (result.checked > 0 || result.skipped > 0) {
                    console.log(`[assistant-learning-scheduler] Checked ${result.checked} (resolved ${result.resolved}, unresolved ${result.unresolved}), skipped ${result.skipped}.`);
                }
            } catch (err) {
                console.error("[assistant-learning-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[assistant-learning-scheduler] Started. Runs daily at 09:15 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return checkDueGuidance();
    }
}

export default new AssistantLearningScheduler();
