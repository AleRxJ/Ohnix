import { prisma } from "../db/prisma.js";

// Single write path for cash_movements - mirror of
// stockMovement.service.js#recordStockMovement. Every place that mutates
// CashAccount.balance must call this from inside the same transaction that
// changes the balance, so the ledger and the live balance can never drift
// apart.
export const recordCashMovement = (
    tx,
    { cashAccountId, delta, balanceAfter, sourceType, sourceId, reason, createdById }
) =>
    tx.cashMovement.create({
        data: {
            cashAccountId,
            delta,
            balanceAfter,
            sourceType,
            sourceId: sourceId ?? null,
            reason: reason ?? null,
            createdById,
        },
    });

// Atomically claims `amount` from one cash account - mirror of
// productLocationStock.service.js#claimLocationStock. Returns the account's
// new balance on success, or null on failure (never throws), so each call
// site keeps its own error message/shape.
export const claimCashAccount = async (tx, { cashAccountId, amount }) => {
    const claim = await tx.cashAccount.updateMany({
        where: { id: cashAccountId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
    });
    if (claim.count === 0) return null;

    const row = await tx.cashAccount.findUniqueOrThrow({
        where: { id: cashAccountId },
        select: { balance: true },
    });
    return row.balance;
};

// Credits `amount` to one cash account - mirror of
// productLocationStock.service.js#creditLocationStock. Never fails.
export const creditCashAccount = async (tx, { cashAccountId, amount }) => {
    const row = await tx.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { increment: amount } },
    });
    return row.balance;
};

export const listCashMovements = async ({ cashAccountId, take = 200 }) =>
    prisma.cashMovement.findMany({
        where: { cashAccountId },
        include: { createdBy: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
        take,
    });
