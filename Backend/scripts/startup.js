import { execSync } from "node:child_process";

const provider = (process.env.DB_PROVIDER || "mongo").toLowerCase();

if (provider === "postgres" || provider === "prisma") {
    console.log("🔧 Syncing Prisma schema before startup...");
    try {
        execSync("npx prisma db push", { stdio: "inherit" });
    } catch (error) {
        console.error("❎ Prisma schema sync failed. Aborting startup.");
        process.exit(1);
    }
}

await import("../server.js");
