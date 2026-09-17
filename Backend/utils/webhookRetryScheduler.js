import cron from "node-cron";
import { sweepDueDeliveries } from "../services/webhookDispatch.service.js";

// Same start/stop shape as lowStockScheduler.js/subscriptionRenewalScheduler.js.
// Runs every minute - webhook backoff steps are minute-granular (see
// BACKOFF_MINUTES in webhookDispatch.service.js), so anything coarser would
// under-deliver the fastest retry tier.
class WebhookRetryScheduler {
    constructor() {
        this.task = null;
    }

    start() {
        if (this.task) return;
        this.task = cron.schedule("* * * * *", async () => {
            try {
                await sweepDueDeliveries();
            } catch (error) {
                console.error("[webhook-retry] sweep failed", error);
            }
        });
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}

export default new WebhookRetryScheduler();
