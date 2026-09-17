import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { prisma } from "../db/prisma.js";
import purchaseService from "../services/purchase.service.js";

const EMAIL = (process.argv[2] || "alejandrovallejo10@outlook.com").trim().toLowerCase();

const run = async () => {
    await prisma.$connect();
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) throw new Error("Seed user not found - run seedAccountingAudit.js first.");

    const purchase = await prisma.purchase.findFirst({
        where: { createdById: user.id, purchaseStatus: "completed" },
        orderBy: { createdAt: "desc" },
    });
    if (!purchase) throw new Error("No completed purchase found to return against.");

    const details = await prisma.purchaseDetail.findMany({ where: { purchaseId: purchase.id } });
    const line = details.find((d) => d.quantity - d.returnedQuantity > 0);
    if (!line) {
        console.log("No returnable purchase line found - skipping.");
        return;
    }

    await purchaseService.processReturn(
        purchase.id,
        [{ purchase_detail_id: line.id, quantity: 1 }],
        user.id,
        "user",
        undefined
    );
    console.log("Processed purchase return on purchase", purchase.id);
};

run()
    .catch((err) => {
        console.error("Extra seed failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
