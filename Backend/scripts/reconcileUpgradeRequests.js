import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

const SPECIAL_ENTERPRISE_REVIEW_REGEX =
    /(factura|invoice|descuento|discount|negoci|custom|personaliz|contrato|contract|sla|onboarding|implementation|implementacion|po\b|purchase\s*order)/i;

const AUTO_APPROVED_RESPONSE =
    "Auto-approved by reconciliation. Complete payment to activate your plan.";

const parseArgs = () => ({
    apply: process.argv.includes("--apply"),
});

const isLegacySignupRequest = (request) =>
    `${request.notes || ""}`.trim().toLowerCase() ===
    "requested during signup".toLowerCase();

const isSpecialCase = (request) => {
    const notes = `${request.notes || ""}`;
    return request.targetPlan === "enterprise" && SPECIAL_ENTERPRISE_REVIEW_REGEX.test(notes);
};

const shouldAutoApprove = (request) => {
    if (isLegacySignupRequest(request)) {
        return true;
    }

    if (request.targetPlan === "growth") {
        return true;
    }

    if (request.targetPlan === "enterprise") {
        return !isSpecialCase(request);
    }

    return false;
};

const main = async () => {
    const { apply } = parseArgs();

    const candidates = await prisma.planUpgradeRequest.findMany({
        where: {
            status: {
                in: ["open", "reviewing"],
            },
            targetPlan: {
                in: ["growth", "enterprise"],
            },
        },
        select: {
            id: true,
            userId: true,
            currentPlan: true,
            targetPlan: true,
            status: true,
            notes: true,
            adminResponse: true,
            paymentStatus: true,
            createdAt: true,
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    const autoApprove = candidates.filter(shouldAutoApprove);
    const keepManual = candidates.filter((request) => !shouldAutoApprove(request));

    console.log("[reconcile-upgrades] Summary");
    console.log(`- mode: ${apply ? "APPLY" : "DRY-RUN"}`);
    console.log(`- pending candidates: ${candidates.length}`);
    console.log(`- will auto-approve: ${autoApprove.length}`);
    console.log(`- keep manual review: ${keepManual.length}`);

    if (!apply) {
        console.log("\n[reconcile-upgrades] Dry-run complete. Use --apply to persist changes.");
        return;
    }

    let updated = 0;

    for (const request of autoApprove) {
        await prisma.planUpgradeRequest.update({
            where: { id: request.id },
            data: {
                status: "approved",
                adminResponse: request.adminResponse || AUTO_APPROVED_RESPONSE,
                paymentStatus: request.paymentStatus || "awaiting_checkout",
            },
        });

        updated += 1;
    }

    console.log(`\n[reconcile-upgrades] Updated requests: ${updated}`);
};

main()
    .catch((error) => {
        console.error("[reconcile-upgrades] Failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
