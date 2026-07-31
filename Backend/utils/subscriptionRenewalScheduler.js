// Backend/utils/subscriptionRenewalScheduler.js
//
// Runs daily:
//  1. Sends renewal reminder emails 7 days before a paid plan expires.
//  2. After a 5-day grace period past expiry, downgrades to starter.
//
// Grace period avoids penalizing users who renew 1-2 days late.

import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { notifyUserRenewalReminder } from "./upgradeRequestNotifications.js";
import { isMailConfigured } from "./nodemailer.js";

const REMINDER_DAYS_AFTER_EXPIRY = 1;  // send email 1 day after plan expires
const GRACE_PERIOD_DAYS           = 5;  // days after expiry before downgrading

// ── Reminder: subscriptions that expired ~1 day ago ──────────────────────────
async function sendRenewalReminders() {
    const now = new Date();
    // Window: between 1 and 2 days past expiry
    const windowStart = new Date(now.getTime() - (REMINDER_DAYS_AFTER_EXPIRY + 1) * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() - REMINDER_DAYS_AFTER_EXPIRY * 24 * 60 * 60 * 1000);

    const recentlyExpired = await prisma.subscription.findMany({
        where: {
            status: "active",
            plan: { not: "starter" },
            endsAt: { gte: windowStart, lte: windowEnd },
        },
        include: {
            user: { select: { id: true, email: true, username: true, preferredLanguage: true } },
        },
    });

    let sent = 0;
    for (const sub of recentlyExpired) {
        if (!sub.user?.email) continue;
        await notifyUserRenewalReminder({
            user: sub.user,
            plan: sub.plan,
            endsAt: sub.endsAt,
            daysLeft: 0, // already expired
            locale: sub.user.preferredLanguage,
        });
        sent++;
    }

    if (sent > 0) {
        console.log(`[renewal-scheduler] Sent ${sent} post-expiry renewal reminder(s).`);
    }

    return sent;
}

// ── Expiry: downgrade subscriptions past grace period ────────────────────────
async function downgradeExpiredSubscriptions() {
    const graceCutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.subscription.updateMany({
        where: {
            status: "active",
            plan: { not: "starter" },
            endsAt: { lt: graceCutoff },
        },
        data: {
            plan: "starter",
            endsAt: null,
        },
    });

    if (result.count > 0) {
        console.log(`[renewal-scheduler] Downgraded ${result.count} expired subscription(s) to starter.`);
    }

    return result.count;
}

// ── Scheduler ────────────────────────────────────────────────────────────────
class SubscriptionRenewalScheduler {
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

        // Run every day at 8:00 AM in the configured timezone
        this.task = cron.schedule("0 8 * * *", async () => {
            console.log("[renewal-scheduler] Running daily renewal checks...");
            try {
                await sendRenewalReminders();
                await downgradeExpiredSubscriptions();
            } catch (err) {
                console.error("[renewal-scheduler] Error during daily run:", err?.message);
            }
        }, { timezone });

        console.log(`[renewal-scheduler] Started. Runs daily at 08:00 (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    // Manual trigger for testing
    async runNow() {
        const reminders = await sendRenewalReminders();
        const downgrades = await downgradeExpiredSubscriptions();
        return { reminders, downgrades };
    }
}

export default new SubscriptionRenewalScheduler();
