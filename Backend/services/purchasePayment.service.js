import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordCashMovement, claimCashAccount } from "./cashMovement.service.js";
import { postPurchasePaymentJournalEntry } from "./accountingPosting.service.js";

// Cartera (accounts payable): what's owed to the supplier is the tax-inclusive
// total of every line (PurchaseDetail.total + taxAmount), minus SUM(PurchasePayment.amount).
// Purchase has no stored total (see purchase.controller.js#mapPurchase) - it's
// always derived from its details, same here.
export const getPurchasePendingBalance = async (purchaseId) => {
    const [purchase, detailsAgg, paidAgg] = await Promise.all([
        prisma.purchase.findUnique({ where: { id: purchaseId }, select: { id: true, purchaseNo: true, purchaseStatus: true } }),
        prisma.purchaseDetail.aggregate({ where: { purchaseId }, _sum: { total: true, taxAmount: true } }),
        prisma.purchasePayment.aggregate({ where: { purchaseId }, _sum: { amount: true } }),
    ]);
    if (!purchase) throw new ApiError(404, "Compra no encontrada.");

    const total = Number(detailsAgg._sum.total || 0) + Number(detailsAgg._sum.taxAmount || 0);
    const paid = Number(paidAgg._sum.amount || 0);
    const pending = total - paid;
    return { purchase, total, paid, pending };
};

export const listPurchasePayments = async ({ accountId, purchaseId }) => {
    const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, createdById: accountId }, select: { id: true } });
    if (!purchase) throw new ApiError(404, "Compra no encontrada.");

    return prisma.purchasePayment.findMany({
        where: { purchaseId: purchase.id },
        include: { cashAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, username: true } } },
        orderBy: { paidAt: "desc" },
    });
};

export const registerPurchasePayment = async ({ accountId, actorId, purchaseId, amount, cashAccountId, method, reference }) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "El monto del pago debe ser mayor a cero.");
    }

    const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, createdById: accountId } });
    if (!purchase) throw new ApiError(404, "Compra no encontrada.");

    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id: cashAccountId, createdById: accountId, isActive: true },
    });
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");

    const { pending } = await getPurchasePendingBalance(purchaseId);
    if (numericAmount > pending + 0.001) {
        throw new ApiError(422, `El pago (${numericAmount}) excede el saldo pendiente de la compra (${pending}).`);
    }

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount: numericAmount });
        if (balanceAfter === null) {
            throw new ApiError(422, "Saldo insuficiente en la cuenta de caja/banco seleccionada.");
        }

        const payment = await tx.purchasePayment.create({
            data: {
                purchaseId,
                amount: numericAmount,
                cashAccountId,
                method: method?.trim() || null,
                reference: reference?.trim() || null,
                createdById: actorId,
            },
        });

        await recordCashMovement(tx, {
            cashAccountId,
            delta: -numericAmount,
            balanceAfter,
            sourceType: "purchase_payment",
            sourceId: payment.id,
            reason: `Pago de compra ${purchase.purchaseNo}`,
            createdById: actorId,
        });

        await postPurchasePaymentJournalEntry(tx, {
            accountId,
            createdById: actorId,
            payment,
            cashAccount,
            purchase,
        });

        return payment;
    });
};
