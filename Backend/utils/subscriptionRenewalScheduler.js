// Backend/utils/subscriptionRenewalScheduler.js
//
// Runs daily:
//  1. Sends renewal reminder emails 1 day after a paid plan (any plan,
//     including Starter - see pricing.middleware.js PLAN_PRICES_USD) expires.
//  2. Sends "your trial is ending" emails a few days before an unpaid trial
//     (Starter, never activated with a real payment) runs out.
//  3. After a 5-day grace period past expiry/trial end, blocks access
//     (status: "paused") for anything that was never renewed/paid.
//
// Grace period avoids penalizing users who renew 1-2 days late.
//
// Subscriptions with a stored card and autoRenew on are charged
// automatically first (runDueAutoRenewals - see
// services/subscriptionAutoRenew.service.js, which also owns the retry
// schedule) and get a pre-charge notice instead of the post-expiry
// "please renew" reminder.

import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { notifyUserRenewalReminder, notifyUserTrialEndingSoon } from "./upgradeRequestNotifications.js";
import { runDueAutoRenewals, sendUpcomingChargeNotices } from "../services/subscriptionAutoRenew.service.js";

const REMINDER_DAYS_AFTER_EXPIRY = 1;  // send email 1 day after plan expires
const TRIAL_REMINDER_DAYS_BEFORE = 3;  // send email 3 days before trial ends
const GRACE_PERIOD_DAYS          = 5;  // days after expiry/trial end before blocking access

// ── Reminder: paid subscriptions (any plan) that expired ~1 day ago ─────────
async function sendRenewalReminders() {
    const now = new Date();
    // Window: between 1 and 2 days past expiry
    const windowStart = new Date(now.getTime() - (REMINDER_DAYS_AFTER_EXPIRY + 1) * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() - REMINDER_DAYS_AFTER_EXPIRY * 24 * 60 * 60 * 1000);

    const recentlyExpired = await prisma.subscription.findMany({
        where: {
            status: "active",
            endsAt: { gte: windowStart, lte: windowEnd },
            // Auto-renewing accounts are being charged/retried instead -
            // their failure emails already tell them what to do.
            autoRenew: false,
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

// ── Reminder: free trials (never paid) ending in a few days ─────────────────
async function sendTrialEndingReminders() {
    const now = new Date();
    // Window: trial ends between 3 and 4 days from now (narrow enough that
    // the daily cron only catches each subscription once).
    const windowStart = new Date(now.getTime() + TRIAL_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (TRIAL_REMINDER_DAYS_BEFORE + 1) * 24 * 60 * 60 * 1000);

    const endingTrials = await prisma.subscription.findMany({
        where: {
            status: "active",
            plan: "starter",
            endsAt: null, // never actually paid - still on the free trial
            trialEndsAt: { gte: windowStart, lte: windowEnd },
        },
        include: {
            user: { select: { id: true, email: true, username: true, preferredLanguage: true } },
        },
    });

    let sent = 0;
    for (const sub of endingTrials) {
        if (!sub.user?.email) continue;
        await notifyUserTrialEndingSoon({
            user: sub.user,
            trialEndsAt: sub.trialEndsAt,
            daysLeft: TRIAL_REMINDER_DAYS_BEFORE,
            locale: sub.user.preferredLanguage,
        });
        sent++;
    }

    if (sent > 0) {
        console.log(`[renewal-scheduler] Sent ${sent} trial-ending reminder(s).`);
    }

    return sent;
}

// ── Block: paid periods and trials that lapsed past the grace period ────────
// Every plan (Starter included) requires payment - there is no free tier to
// fall back to anymore, so a lapsed subscription is blocked (status: "paused",
// which pricing.middleware.js's ensureActiveSubscription already gates all
// product/report/API access on). Accounts with automatic renewal are paused
// here too once their charges keep failing past the grace period - their
// later retries (runDueAutoRenewals) reactivate them on success. `plan` is
// otherwise left untouched so the user's billing
// page still shows what they were on when reactivating - EXCEPT for a
// subscription with a scheduledPlan set (self-service "bajar de plan" - see
// downgradeMySubscription): that's the one case `plan` DOES change here, on
// purpose, so the next time they pay it's for the lower plan they actually
// asked for instead of silently re-billing the higher one.
async function blockLapsedSubscriptions() {
    const graceCutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Handled individually first (each row needs its OWN scheduledPlan value
    // written to `plan`, which a single updateMany can't express) and
    // excluded from the bulk updateMany below via scheduledPlan: null there.
    const withScheduledDowngrade = await prisma.subscription.findMany({
        where: {
            status: "active",
            endsAt: { lt: graceCutoff },
            scheduledPlan: { not: null },
        },
        select: { userId: true, plan: true, scheduledPlan: true },
    });

    for (const sub of withScheduledDowngrade) {
        await prisma.subscription.update({
            where: { userId: sub.userId },
            data: {
                plan: sub.scheduledPlan,
                scheduledPlan: null,
                status: "paused",
                cancelAtPeriodEnd: false,
            },
        });
    }

    const expiredPaid = await prisma.subscription.updateMany({
        where: {
            status: "active",
            endsAt: { lt: graceCutoff },
            scheduledPlan: null,
        },
        data: {
            status: "paused",
            cancelAtPeriodEnd: false,
        },
    });

    const expiredTrials = await prisma.subscription.updateMany({
        where: {
            status: "active",
            plan: "starter",
            endsAt: null,
            trialEndsAt: { lt: graceCutoff },
        },
        data: {
            status: "paused",
        },
    });

    const total = withScheduledDowngrade.length + expiredPaid.count + expiredTrials.count;
    if (total > 0) {
        console.log(
            `[renewal-scheduler] Blocked ${expiredPaid.count} lapsed paid subscription(s) (${withScheduledDowngrade.length} with a scheduled downgrade applied) and ${expiredTrials.count} expired trial(s).`
        );
    }

    return total;
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
                // Charges first, so a successful renewal is never reminded or blocked.
                await runDueAutoRenewals();
                await sendUpcomingChargeNotices();
                await sendRenewalReminders();
                await sendTrialEndingReminders();
                await blockLapsedSubscriptions();
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
        const autoRenewals = await runDueAutoRenewals();
        const upcomingChargeNotices = await sendUpcomingChargeNotices();
        const reminders = await sendRenewalReminders();
        const trialReminders = await sendTrialEndingReminders();
        const blocked = await blockLapsedSubscriptions();
        return { autoRenewals, upcomingChargeNotices, reminders, trialReminders, blocked };
    }
}

export default new SubscriptionRenewalScheduler();
