// Backend/scripts/fixMissingEndsAt.js
//
// One-time script: sets ends_at = started_at + 30 days for all paid
// subscriptions that are missing ends_at (activated before the renewal
// system was deployed).
// Also clears trial_ends_at for paid plan users.
//
// Usage:
//   node scripts/fixMissingEndsAt.js          — dry run (shows what would change)
//   node scripts/fixMissingEndsAt.js --apply  — actually applies the fix

import { prisma } from "../db/prisma.js";

const DRY_RUN = !process.argv.includes("--apply");

async function run() {
    if (DRY_RUN) {
        console.log("🔍 DRY RUN — no changes will be written. Pass --apply to commit.\n");
    } else {
        console.log("⚡ APPLYING fixes...\n");
    }

    const affected = await prisma.subscription.findMany({
        where: {
            plan: { not: "starter" },
            status: "active",
            endsAt: null,
        },
        select: {
            id: true,
            userId: true,
            plan: true,
            startedAt: true,
            trialEndsAt: true,
            user: { select: { email: true, username: true } },
        },
    });

    if (affected.length === 0) {
        console.log("✅ No subscriptions need fixing.");
        await prisma.$disconnect();
        return;
    }

    console.log(`Found ${affected.length} subscription(s) missing ends_at:\n`);

    for (const sub of affected) {
        const endsAt = new Date(sub.startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

        console.log(
            `  ${sub.user?.username || sub.userId}  (${sub.user?.email})\n` +
            `  plan=${sub.plan}  started_at=${sub.startedAt.toISOString()}\n` +
            `  → ends_at will be set to ${endsAt.toISOString()}\n` +
            `  → trial_ends_at will be cleared\n`
        );

        if (!DRY_RUN) {
            await prisma.subscription.update({
                where: { id: sub.id },
                data: {
                    endsAt,
                    trialEndsAt: null,
                },
            });
            console.log(`  ✅ Fixed.\n`);
        }
    }

    if (DRY_RUN) {
        console.log("\nRun with --apply to commit these changes.");
    } else {
        console.log(`\n✅ Done. Fixed ${affected.length} subscription(s).`);
    }

    await prisma.$disconnect();
}

run().catch((err) => {
    console.error("❌ Script failed:", err);
    process.exit(1);
});
