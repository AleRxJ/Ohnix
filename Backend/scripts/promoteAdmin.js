// One-off promotion for a single user, regardless of how many admins already
// exist - bootstrapProd.js deliberately only auto-promotes when there are
// ZERO admins yet, so it can't be reused to add a second/third admin (e.g.
// a founder's own test account) on an already-bootstrapped environment.
//
// Usage: node scripts/promoteAdmin.js someone@example.com
import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

const email = `${process.argv[2] || ""}`.trim().toLowerCase();

const main = async () => {
    if (!email) {
        console.error("Usage: node scripts/promoteAdmin.js someone@example.com");
        process.exitCode = 1;
        return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.error(`No user found with email: ${email}`);
        process.exitCode = 1;
        return;
    }

    const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: "admin" },
        select: { id: true, email: true, username: true, role: true },
    });

    console.log(`Promoted to admin: ${updated.email} (${updated.username})`);
};

main()
    .catch((error) => {
        console.error("Failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
