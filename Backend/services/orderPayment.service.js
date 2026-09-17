import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordCashMovement, creditCashAccount } from "./cashMovement.service.js";
import { buildAccountingThirdParty, postOrderPaymentJournalEntry } from "./accountingPosting.service.js";

// Single receivable balance used by payment validation and the planning UI:
// frozen sale base/tax, less returns and financial credit notes, less cash
// already collected. This prevents collecting more than the accounting
// receivable after a post-sale adjustment.
export const getOrderPendingBalance = async (orderId, db = prisma) => {
    const [order, paidAgg, notes] = await Promise.all([
        db.order.findUnique({ where: { id: orderId }, select: { id: true, total: true, orderStatus: true, orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } } } }),
        db.orderPayment.aggregate({ where: { orderId }, _sum: { amount: true } }),
        db.electronicCreditNote.findMany({ where: { invoice: { orderId } }, select: { id: true } }),
    ]);
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    const entries = notes.length ? await db.journalEntry.findMany({ where: { sourceType: "credit_note_financial", sourceId: { in: notes.map((note) => note.id) } }, select: { lines: { where: { chartAccount: { code: "1305" } }, select: { credit: true } } } }) : [];
    const operationalTotal = order.orderDetails.reduce((sum, row) => sum + Number(row.total) + Number(row.taxAmount) - Number(row.refundAmount) - Number(row.returnedTaxAmount), 0);
    const creditReduction = entries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + Number(line.credit), 0), 0);
    const total = Math.max(Number((operationalTotal - creditReduction).toFixed(2)), 0);
    const paid = paidAgg._sum.amount || 0;
    const pending = Number((total - Number(paid)).toFixed(2));
    return { order, total, paid: Number(paid), pending };
};

export const listOrderPayments = async ({ accountId, orderId }) => {
    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId }, select: { id: true } });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");

    return prisma.orderPayment.findMany({
        where: { orderId: order.id },
        include: { cashAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, username: true } } },
        orderBy: { paidAt: "desc" },
    });
};

export const registerOrderPayment = async ({ accountId, actorId, orderId, amount, cashAccountId, method, reference }) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "Payment amount must be greater than zero.", [], "", "order_payment_amount_invalid");
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, createdById: accountId },
        include: { customer: { select: { id: true, name: true, identification: true } } },
    });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    if (order.orderStatus === "cancelled") {
        throw new ApiError(400, "Payments cannot be recorded for a cancelled order.", [], "", "order_payment_order_cancelled");
    }

    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id: cashAccountId, createdById: accountId, isActive: true },
    });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "order_payment_cash_account_not_found");

    try {
        return await prisma.$transaction(async (tx) => {
        const { pending } = await getOrderPendingBalance(orderId, tx);
        if (numericAmount > pending + 0.001) {
            throw new ApiError(422, `Payment (${numericAmount}) exceeds the order balance (${pending}).`, [], "", "order_payment_exceeds_balance");
        }

        const payment = await tx.orderPayment.create({
            data: {
                orderId,
                amount: numericAmount,
                cashAccountId,
                method: method?.trim() || null,
                reference: reference?.trim() || null,
                createdById: actorId,
            },
        });

        const balanceAfter = await creditCashAccount(tx, { cashAccountId, amount: numericAmount });

        await recordCashMovement(tx, {
            cashAccountId,
            delta: numericAmount,
            balanceAfter,
            sourceType: "order_payment",
            sourceId: payment.id,
            reason: `Pago de pedido ${order.invoiceNo}`,
            createdById: actorId,
        });

        await postOrderPaymentJournalEntry(tx, {
            accountId,
            createdById: actorId,
            payment,
            cashAccount,
            order,
            thirdParty: buildAccountingThirdParty("customer", order.customer),
        });

        return payment;
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") {
            throw new ApiError(409, "Payment could not be recorded because the balance changed. Try again.", [], "", "order_payment_concurrent_change");
        }
        throw error;
    }
};
