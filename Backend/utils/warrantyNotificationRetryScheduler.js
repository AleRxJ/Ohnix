import cron from "node-cron";
import { sweepDueWarrantyCommunications } from "../services/warrantyNotification.service.js";

// Same start/stop shape as webhookRetryScheduler.js/lowStockScheduler.js.
// Runs every minute, matching BACKOFF_MINUTES's finest tier in
// warrantyNotification.service.js.
class WarrantyNotificationRetryScheduler {
    constructor() {
        this.task = null;
    }

    start() {
        if (this.task) return;
        this.task = cron.schedule("* * * * *", async () => {
            try {
                await sweepDueWarrantyCommunications();
            } catch (error) {
                console.error("[warranty-notify-retry] sweep failed", error);
            }
        });
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}

export default new WarrantyNotificationRetryScheduler();
