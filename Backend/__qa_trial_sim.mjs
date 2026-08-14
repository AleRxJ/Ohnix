import dotenv from "dotenv";
import { prisma } from "./db/prisma.js";
dotenv.config({ path: "./.env" });

const email = "test@example.com";
const mode = process.argv[2]; // "grace" | "expired" | "reset" | "status"

const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
if (!user) throw new Error("test user not found");

if (mode === "grace") {
    // 2 days past trialEndsAt - inside the 5-day grace period, status stays active
    await prisma.subscription.update({
        where: { userId: user.id },
        data: { trialEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), endsAt: null, status: "active" },
    });
} else if (mode === "expired") {
    // 6 days past trialEndsAt - past the 5-day grace period
    await prisma.subscription.update({
        where: { userId: user.id },
        data: { trialEndsAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), endsAt: null, status: "active" },
    });
} else if (mode === "paused") {
    // Directly apply what blockLapsedSubscriptions would do for this one
    // subscription, scoped to just this user (not the whole table) so we
    // don't touch other accounts' status or trigger scheduler-wide emails.
    await prisma.subscription.update({
        where: { userId: user.id },
        data: { trialEndsAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), endsAt: null, status: "paused" },
    });
} else if (mode === "reset") {
    await prisma.subscription.update({
        where: { userId: user.id },
        data: { trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), endsAt: null, status: "active" },
    });
} else if (mode === "status") {
    // no-op, just print
} else {
    throw new Error("usage: node __qa_trial_sim.mjs <grace|expired|reset|status>");
}

const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
console.log(JSON.stringify(sub, null, 2));
await prisma.$disconnect();
