import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { prisma } from "../db/prisma.js";

// Moves the earliest purchase/order/order-payment into last month so there's
// a genuinely closeable past AccountingPeriod to test closeAccountingPeriod
// against - none of the real service functions accept a backdate param, so
// this reaches into the DB directly (moving BOTH entryDate and periodId
// together, since those must stay consistent) rather than trying to fake it
// through the API.

const EMAIL = "alejandrovallejo10@outlook.com";

const run = async () => {
    await prisma.$connect();
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) throw new Error("Seed user not found - run seedAccountingAudit.js first.");

    const purchase = await prisma.purchase.findFirst({
        where: { createdById: user.id, purchaseStatus: "completed" },
        orderBy: { createdAt: "asc" },
    });
    const order = await prisma.order.findFirst({
        where: { createdById: user.id, orderStatus: "completed" },
        orderBy: { createdAt: "asc" },
    });
    if (!purchase || !order) throw new Error("Expected an existing purchase and order to backdate.");

    const orderPayment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } });

    const now = new Date();
    const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
    const lastYear = lastMonthDate.getUTCFullYear();
    const lastMonth = lastMonthDate.getUTCMonth() + 1;

    const lastPeriod = await prisma.accountingPeriod.upsert({
        where: { createdById_year_month: { createdById: user.id, year: lastYear, month: lastMonth } },
        update: {},
        create: { createdById: user.id, year: lastYear, month: lastMonth },
    });

    const sourceIds = [purchase.id, order.id, ...(orderPayment ? [orderPayment.id] : [])];
    const entries = await prisma.journalEntry.findMany({ where: { sourceId: { in: sourceIds } } });
    console.log(`Found ${entries.length} journal entries to backdate`);

    for (const entry of entries) {
        await prisma.journalEntry.update({
            where: { id: entry.id },
            data: { entryDate: lastMonthDate, periodId: lastPeriod.id },
        });
    }

    await prisma.purchase.update({ where: { id: purchase.id }, data: { purchaseDate: lastMonthDate } });
    await prisma.order.update({ where: { id: order.id }, data: { orderDate: lastMonthDate } });
    if (orderPayment) {
        await prisma.orderPayment.update({ where: { id: orderPayment.id }, data: { paidAt: lastMonthDate } });
    }

    console.log("Backdated purchase", purchase.id, "order", order.id, "into", lastYear, lastMonth, "period", lastPeriod.id);
};

run()
    .catch((err) => {
        console.error("Backdate failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
