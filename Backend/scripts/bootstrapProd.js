import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me" || normalized === "change_me@gmail.com";
};

const normalizeBoolean = (value) =>
    ["1", "true", "yes", "y"].includes(`${value || ""}`.trim().toLowerCase());

const normalizeEmail = (email) => `${email || ""}`.trim().toLowerCase();

const printConfigWarnings = () => {
    const warnings = [];

    if (isPlaceholder(process.env.SENDER_EMAIL) || isPlaceholder(process.env.SENDER_PASSWORD)) {
        warnings.push("Email SMTP is not fully configured (SENDER_EMAIL/SENDER_PASSWORD)");
    }

    if (
        isPlaceholder(process.env.R2_ACCOUNT_ID) ||
        isPlaceholder(process.env.R2_ACCESS_KEY_ID) ||
        isPlaceholder(process.env.R2_SECRET_ACCESS_KEY) ||
        isPlaceholder(process.env.R2_BUCKET_NAME) ||
        isPlaceholder(process.env.R2_PUBLIC_URL)
    ) {
        warnings.push("Cloudflare R2 storage is not fully configured (R2_*)");
    }

    if (isPlaceholder(process.env.ACCESS_TOKEN_SECRET) || isPlaceholder(process.env.REFRESH_TOKEN_SECRET)) {
        warnings.push("JWT secrets look like placeholders (ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET)");
    }

    if (warnings.length) {
        console.log("\n[bootstrap] Configuration warnings:");
        warnings.forEach((item) => console.log(`- ${item}`));
    } else {
        console.log("\n[bootstrap] Configuration checks: OK");
    }
};

const promoteUserToAdmin = async (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return null;
    }

    const existing = await prisma.user.findUnique({
        where: { email: normalized },
        select: { id: true, email: true, username: true, role: true, isVerified: true },
    });

    if (!existing) {
        return null;
    }

    const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
            role: "admin",
            isVerified: true,
        },
        select: { id: true, email: true, username: true, role: true, isVerified: true },
    });

    return updated;
};

const main = async () => {
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
    const autoPromoteFirstUser = normalizeBoolean(process.env.AUTO_PROMOTE_FIRST_USER);

    const totalUsers = await prisma.user.count();
    const currentAdmins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true, username: true, email: true, isVerified: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });

    console.log(`[bootstrap] Connected. Users: ${totalUsers}. Admins: ${currentAdmins.length}.`);

    let promoted = null;

    if (currentAdmins.length === 0) {
        if (adminEmail) {
            promoted = await promoteUserToAdmin(adminEmail);
            if (!promoted) {
                console.log(`[bootstrap] ADMIN_EMAIL not found: ${adminEmail}`);
            }
        }

        if (!promoted && autoPromoteFirstUser) {
            const firstUser = await prisma.user.findFirst({
                orderBy: { createdAt: "asc" },
                select: { email: true },
            });

            if (firstUser?.email) {
                promoted = await promoteUserToAdmin(firstUser.email);
                if (promoted) {
                    console.log(`[bootstrap] Promoted first user automatically: ${promoted.email}`);
                }
            }
        }

        if (!promoted) {
            const candidates = await prisma.user.findMany({
                select: { username: true, email: true, createdAt: true },
                orderBy: { createdAt: "asc" },
                take: 10,
            });
            console.log("[bootstrap] No admin created. Set ADMIN_EMAIL and re-run.");
            console.log("[bootstrap] Admin candidates:");
            candidates.forEach((user) => {
                console.log(`- ${user.email} (${user.username})`);
            });
        }
    }

    const finalAdmins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { username: true, email: true, isVerified: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });

    console.log("\n[bootstrap] Final admin users:");
    if (!finalAdmins.length) {
        console.log("- (none)");
    } else {
        finalAdmins.forEach((admin) => {
            console.log(`- ${admin.email} (${admin.username}) verified=${admin.isVerified}`);
        });
    }

    printConfigWarnings();
};

main()
    .catch((error) => {
        console.error("[bootstrap] Failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
