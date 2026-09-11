// Backend/utils/receiptTacitaScheduler.js
//
// Runs daily: applies aceptación tácita to every ReceivedInvoiceReceipt whose
// 3-business-day window has elapsed with no reclamo sent - see
// receiptAcknowledgment.service.js#applyDueTacitaAcceptances. Purely local
// (no itcycle-api-dian call): tácita is a legal fact of silence, never
// transmitted to DIAN.

import cron from "node-cron";
import { applyDueTacitaAcceptances } from "../services/receiptAcknowledgment.service.js";

class ReceiptTacitaScheduler {
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

        // Offset from the renewal (8:00) and recurring-expense (8:15)
        // scheduler slots purely to avoid contending for the same instant -
        // no functional relationship between them.
        this.task = cron.schedule("30 8 * * *", async () => {
            console.log("[receipt-tacita-scheduler] Checking due aceptación tácita...");
            try {
                const result = await applyDueTacitaAcceptances();
                if (result.applied > 0 || result.skipped > 0) {
                    console.log(`[receipt-tacita-scheduler] Checked ${result.checked}, applied ${result.applied}, skipped ${result.skipped}.`);
                }
            } catch (err) {
                console.error("[receipt-tacita-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[receipt-tacita-scheduler] Started. Runs daily at 08:30 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return applyDueTacitaAcceptances();
    }
}

export default new ReceiptTacitaScheduler();
