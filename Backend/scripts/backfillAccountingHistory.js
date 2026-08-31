import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";
import {
    postOrderSaleJournalEntry,
    postPurchaseJournalEntry,
    postOrderPaymentJournalEntry,
    postPurchasePaymentJournalEntry,
    postOrderReturnJournalEntry,
    postPurchaseReturnJournalEntry,
} from "../services/accountingPosting.service.js";

dotenv.config();

// Retroactively posts JournalEntry rows for Orders/Purchases/payments that
// completed before the accounting engine (Fase 4) existed - see
// C:\Users\User\.claude\plans\sleepy-sniffing-summit.md for the full design.
//
// Uses StockMovement existence as the only source of truth for "did this
// actually complete at some point" - NOT the current orderStatus/
// purchaseStatus, since e.g. a currently-cancelled order may have been
// cancelled before ever completing (no stock ever moved, nothing to post).
//
// For returns/cancellations (which can have more than one historical event
// per order/purchase), this posts ONE net "conversion" entry per source
// using the CURRENT accumulated returnedQuantity, the same way a real
// accounting-system migration (QuickBooks/Xero-style) reconciles to a
// correct ending balance instead of replaying every historical event -
// event-level dating is sacrificed on purpose, the ending numbers are what
// matter. Every backfilled entry gets a "[Histórico] " description prefix
// (via a follow-up update, accountingPosting.service.js/journalEntry.
// service.js stay completely untouched) - this prefix is also what
// accounting.controller.js#getAccountingStatus checks for.
//
// isTutorialData rows are always excluded (tutorialData.service.js deletes
// them later anyway - no point creating more orphan-prone journal entries).
// Credit notes are out of scope for this pass.

const parseArgs = () => ({ apply: process.argv.includes("--apply") });

const toNumber = (v) => Number(v);

const findExistingEntry = (sourceType, sourceId) =>
    prisma.journalEntry.findFirst({ where: { sourceType, sourceId }, select: { id: true } });

const findMovements = (sourceType, sourceId) =>
    prisma.stockMovement.findMany({ where: { sourceType, sourceId }, orderBy: { createdAt: "desc" } });

async function collectOrderCandidates() {
    const orders = await prisma.order.findMany({
        where: { isTutorialData: false },
        select: {
            id: true, orderDate: true, invoiceNo: true, total: true, subTotal: true, gst: true,
            orderStatus: true, createdById: true,
        },
    });

    const sale = [];
    const cancellation = [];
    const orderReturn = [];
    const tally = { neverCompleted: 0, alreadyPostedSale: 0 };

    for (const order of orders) {
        const soldMovement = await prisma.stockMovement.findFirst({ where: { sourceType: "order", sourceId: order.id } });
        if (!soldMovement) {
            tally.neverCompleted += 1;
            continue;
        }

        const existingSale = await findExistingEntry("order_sale", order.id);
        if (!existingSale) {
            const details = await prisma.orderDetail.findMany({
                where: { orderId: order.id },
                include: { product: { select: { buyingPrice: true } } },
            });
            const cogs = details.reduce((sum, d) => sum + d.quantity * toNumber(d.costBasisApplied ?? d.product.buyingPrice), 0);
            sale.push({ order, cogs });
        } else {
            tally.alreadyPostedSale += 1;
        }

        if (order.orderStatus === "cancelled") {
            const cancelMovements = await findMovements("order_cancellation", order.id);
            if (cancelMovements.length > 0 && !(await findExistingEntry("order_cancellation", order.id))) {
                const details = await prisma.orderDetail.findMany({
                    where: { orderId: order.id },
                    include: { product: { select: { buyingPrice: true } } },
                });
                const lines = details
                    .filter((d) => d.quantity - d.returnedQuantity > 0)
                    .map((d) => ({
                        quantity: d.quantity - d.returnedQuantity,
                        unitcost: d.unitcost,
                        taxRateApplied: d.taxRateApplied,
                        buyingPrice: d.product.buyingPrice,
                    }));
                if (lines.length > 0) {
                    cancellation.push({ order, lines, entryDate: cancelMovements[0].createdAt });
                }
            }
        }

        const returnMovements = await findMovements("order_return", order.id);
        if (returnMovements.length > 0 && !(await findExistingEntry("order_return", order.id))) {
            const details = await prisma.orderDetail.findMany({
                where: { orderId: order.id },
                include: { product: { select: { buyingPrice: true } } },
            });
            const lines = details
                .filter((d) => d.returnedQuantity > 0)
                .map((d) => ({
                    quantity: d.returnedQuantity,
                    unitcost: d.unitcost,
                    taxRateApplied: d.taxRateApplied,
                    buyingPrice: d.product.buyingPrice,
                }));
            if (lines.length > 0) {
                orderReturn.push({ order, lines, entryDate: returnMovements[0].createdAt });
            }
        }
    }

    return { sale, cancellation, orderReturn, tally };
}

async function collectPurchaseCandidates() {
    const purchases = await prisma.purchase.findMany({
        where: { isTutorialData: false },
        select: { id: true, purchaseDate: true, purchaseNo: true, createdById: true },
    });

    const purchase = [];
    const purchaseReturn = [];
    const tally = { neverCompleted: 0, alreadyPostedPurchase: 0 };

    for (const p of purchases) {
        const purchasedMovement = await prisma.stockMovement.findFirst({ where: { sourceType: "purchase", sourceId: p.id } });
        if (!purchasedMovement) {
            tally.neverCompleted += 1;
            continue;
        }

        const existingPurchase = await findExistingEntry("purchase", p.id);
        if (!existingPurchase) {
            const details = await prisma.purchaseDetail.findMany({
                where: { purchaseId: p.id },
                select: { total: true, taxAmount: true },
            });
            const totals = {
                total: details.reduce((sum, d) => sum + toNumber(d.total), 0),
                taxAmount: details.reduce((sum, d) => sum + toNumber(d.taxAmount), 0),
            };
            purchase.push({ purchase: p, totals });
        } else {
            tally.alreadyPostedPurchase += 1;
        }

        const returnMovements = await findMovements("purchase_return", p.id);
        if (returnMovements.length > 0 && !(await findExistingEntry("purchase_return", p.id))) {
            const details = await prisma.purchaseDetail.findMany({
                where: { purchaseId: p.id },
                select: { unitcost: true, taxRateApplied: true, returnedQuantity: true },
            });
            const lines = details
                .filter((d) => d.returnedQuantity > 0)
                .map((d) => ({ quantity: d.returnedQuantity, unitcost: d.unitcost, taxRateApplied: d.taxRateApplied }));
            if (lines.length > 0) {
                purchaseReturn.push({ purchase: p, lines, entryDate: returnMovements[0].createdAt });
            }
        }
    }

    return { purchase, purchaseReturn, tally };
}

async function collectPaymentCandidates() {
    const orderPayments = await prisma.orderPayment.findMany({
        where: { order: { isTutorialData: false } },
        include: { order: { select: { id: true, invoiceNo: true, createdById: true } }, cashAccount: true },
    });
    const purchasePayments = await prisma.purchasePayment.findMany({
        where: { purchase: { isTutorialData: false } },
        include: { purchase: { select: { id: true, purchaseNo: true, createdById: true } }, cashAccount: true },
    });

    const orderPayment = [];
    const purchasePayment = [];
    let alreadyPosted = 0;

    for (const payment of orderPayments) {
        if (await findExistingEntry("order_payment", payment.id)) {
            alreadyPosted += 1;
            continue;
        }
        orderPayment.push(payment);
    }
    for (const payment of purchasePayments) {
        if (await findExistingEntry("purchase_payment", payment.id)) {
            alreadyPosted += 1;
            continue;
        }
        purchasePayment.push(payment);
    }

    return { orderPayment, purchasePayment, tally: { alreadyPosted } };
}

const withHistoricalLabel = async (tx, entry) => {
    if (!entry) return;
    await tx.journalEntry.update({
        where: { id: entry.id },
        data: { description: `[Histórico] ${entry.description ?? ""}`.trim() },
    });
};

async function applyOrderSale({ order, cogs }, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postOrderSaleJournalEntry(tx, {
                accountId: order.createdById, createdById: order.createdById, order, cogs,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted.order_sale += 1;
    } catch (error) {
        failed.push({ type: "order_sale", id: order.id, message: error.message, code: error.code });
    }
}

async function applyOrderReversal({ order, lines, entryDate, sourceType, description }, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postOrderReturnJournalEntry(tx, {
                accountId: order.createdById, createdById: order.createdById,
                sourceType, sourceId: order.id, entryDate, description, lines,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted[sourceType] += 1;
    } catch (error) {
        failed.push({ type: sourceType, id: order.id, message: error.message, code: error.code });
    }
}

async function applyPurchase({ purchase, totals }, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postPurchaseJournalEntry(tx, {
                accountId: purchase.createdById, createdById: purchase.createdById, purchase, totals,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted.purchase += 1;
    } catch (error) {
        failed.push({ type: "purchase", id: purchase.id, message: error.message, code: error.code });
    }
}

async function applyPurchaseReturn({ purchase, lines, entryDate }, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postPurchaseReturnJournalEntry(tx, {
                accountId: purchase.createdById, createdById: purchase.createdById,
                sourceId: purchase.id, entryDate, description: "Devolución de compra", lines,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted.purchase_return += 1;
    } catch (error) {
        failed.push({ type: "purchase_return", id: purchase.id, message: error.message, code: error.code });
    }
}

async function applyOrderPayment(payment, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postOrderPaymentJournalEntry(tx, {
                accountId: payment.order.createdById, createdById: payment.order.createdById,
                payment, cashAccount: payment.cashAccount, order: payment.order,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted.order_payment += 1;
    } catch (error) {
        failed.push({ type: "order_payment", id: payment.id, message: error.message, code: error.code });
    }
}

async function applyPurchasePayment(payment, failed, posted) {
    try {
        await prisma.$transaction(async (tx) => {
            const entry = await postPurchasePaymentJournalEntry(tx, {
                accountId: payment.purchase.createdById, createdById: payment.purchase.createdById,
                payment, cashAccount: payment.cashAccount, purchase: payment.purchase,
            });
            await withHistoricalLabel(tx, entry);
        });
        posted.purchase_payment += 1;
    } catch (error) {
        failed.push({ type: "purchase_payment", id: payment.id, message: error.message, code: error.code });
    }
}

const main = async () => {
    const { apply } = parseArgs();

    const { sale, cancellation, orderReturn, tally: orderTally } = await collectOrderCandidates();
    const { purchase, purchaseReturn, tally: purchaseTally } = await collectPurchaseCandidates();
    const { orderPayment, purchasePayment, tally: paymentTally } = await collectPaymentCandidates();

    console.log("[backfill-accounting] Summary");
    console.log(`- mode: ${apply ? "APPLY" : "DRY-RUN"}`);
    console.log(`- order_sale to post: ${sale.length} (already posted: ${orderTally.alreadyPostedSale}, never completed: ${orderTally.neverCompleted})`);
    console.log(`- order_cancellation to post: ${cancellation.length}`);
    console.log(`- order_return to post: ${orderReturn.length}`);
    console.log(`- purchase to post: ${purchase.length} (already posted: ${purchaseTally.alreadyPostedPurchase}, never completed: ${purchaseTally.neverCompleted})`);
    console.log(`- purchase_return to post: ${purchaseReturn.length}`);
    console.log(`- order_payment to post: ${orderPayment.length}`);
    console.log(`- purchase_payment to post: ${purchasePayment.length}`);
    console.log(`- payments already posted: ${paymentTally.alreadyPosted}`);

    const totalSaleAmount = sale.reduce((sum, s) => sum + toNumber(s.order.total), 0);
    const totalPurchaseAmount = purchase.reduce((sum, p) => sum + p.totals.total + p.totals.taxAmount, 0);
    console.log(`- total order_sale amount: ${totalSaleAmount.toFixed(2)}`);
    console.log(`- total purchase amount: ${totalPurchaseAmount.toFixed(2)}`);

    if (!apply) {
        console.log("\n[backfill-accounting] Dry-run complete. Use --apply to persist changes.");
        return;
    }

    const posted = {
        order_sale: 0, order_cancellation: 0, order_return: 0,
        purchase: 0, purchase_return: 0, order_payment: 0, purchase_payment: 0,
    };
    const failed = [];

    for (const s of sale) await applyOrderSale(s, failed, posted);
    for (const c of cancellation) {
        await applyOrderReversal({ ...c, sourceType: "order_cancellation", description: "Cancelación de pedido" }, failed, posted);
    }
    for (const r of orderReturn) {
        await applyOrderReversal({ ...r, sourceType: "order_return", description: "Devolución de pedido" }, failed, posted);
    }
    for (const p of purchase) await applyPurchase(p, failed, posted);
    for (const r of purchaseReturn) await applyPurchaseReturn(r, failed, posted);
    for (const p of orderPayment) await applyOrderPayment(p, failed, posted);
    for (const p of purchasePayment) await applyPurchasePayment(p, failed, posted);

    console.log("\n[backfill-accounting] Posted:", posted);
    console.log(`[backfill-accounting] Failed: ${failed.length}`);
    if (failed.length > 0) {
        console.log(JSON.stringify(failed, null, 2));
    }
};

main()
    .catch((error) => {
        console.error("[backfill-accounting] Failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
