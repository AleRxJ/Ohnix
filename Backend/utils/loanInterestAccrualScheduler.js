// Backend/utils/loanInterestAccrualScheduler.js
//
// Runs daily: accrues the interest of every loan installment whose due date
// passed unpaid - see financialObligation.service.js#accrueDueInterest
// (same idiom as prepaidExpenseScheduler.js).

import cron from "node-cron";
import { accrueDueInterest } from "../services/financialObligation.service.js";

class LoanInterestAccrualScheduler {
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

        // After the prepaid amortization slot (08:45) - no other
        // relationship, just not the same instant.
        this.task = cron.schedule("50 8 * * *", async () => {
            console.log("[loan-interest-accrual-scheduler] Accruing interest of overdue loan installments...");
            try {
                const result = await accrueDueInterest();
                if (result.posted > 0 || result.failed > 0) {
                    console.log(`[loan-interest-accrual-scheduler] Checked ${result.checked}, posted ${result.posted}, failed ${result.failed}.`);
                }
            } catch (err) {
                console.error("[loan-interest-accrual-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[loan-interest-accrual-scheduler] Started. Runs daily at 08:50 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        return accrueDueInterest();
    }
}

export default new LoanInterestAccrualScheduler();
