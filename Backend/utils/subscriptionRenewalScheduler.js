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

const REMINDER_DAYS_BEFORE = 7;   // send reminder email X days before expiry
const GRACE_PERIOD_DAYS    = 5;   // days after expiry before downgrading

// ── Reminder: subscriptions expiring in 7 days ───────────────────────────────
async function sendRenewalReminders() {
    const now = new Date();
    const windowStart = new Date(now.getTime() + (REMINDER_DAYS_BEFORE - 1) * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (REMINDER_DAYS_BEFORE + 1) * 24 * 60 * 60 * 1000);

    const expiringSoon = await prisma.subscription.findMany({
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
    for (const sub of expiringSoon) {
        if (!sub.user?.email) continue;
        const daysLeft = Math.max(1, Math.ceil((new Date(sub.endsAt) - now) / (1000 * 60 * 60 * 24)));
        await notifyUserRenewalReminder({
            user: sub.user,
            plan: sub.plan,
            endsAt: sub.endsAt,
            daysLeft,
            locale: sub.user.preferredLanguage,
        });
        sent++;
    }

    if (sent > 0) {
        console.log(`[renewal-scheduler] Sent ${sent} renewal reminder email(s).`);
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
