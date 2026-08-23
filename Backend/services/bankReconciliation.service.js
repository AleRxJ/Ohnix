import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Conciliación deliberately simple: a BankStatementEntry is a line already
// structured by the caller (no bank-file-format parser in this scope - see
// the Fase 3 plan). Reconciling = pairing an entry with a CashMovement that
// already exists in the ledger; nothing about the ledger itself changes.

const assertCashAccountOwned = async (accountId, cashAccountId) => {
    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId } });
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");
    return cashAccount;
};

export const createStatementEntries = async ({ accountId, actorId, cashAccountId, entries }) => {
    await assertCashAccountOwned(accountId, cashAccountId);

    if (!Array.isArray(entries) || entries.length === 0) {
        throw new ApiError(400, "Se requiere al menos una entrada de extracto.");
    }

    const data = entries.map((entry, index) => {
        const amount = Number(entry.amount);
        if (!entry.entryDate || !Number.isFinite(amount) || amount === 0) {
            throw new ApiError(400, `Entrada #${index + 1} inválida: entryDate y amount (distinto de cero) son obligatorios.`);
        }
        return {
            cashAccountId,
            entryDate: new Date(entry.entryDate),
            description: entry.description?.trim() || null,
            amount,
            createdById: actorId,
        };
    });

    await prisma.bankStatementEntry.createMany({ data });
    return prisma.bankStatementEntry.findMany({
        where: { cashAccountId, matchedMovementId: null },
        orderBy: { entryDate: "desc" },
    });
};

export const listUnmatchedStatementEntries = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    return prisma.bankStatementEntry.findMany({
        where: { cashAccountId, matchedMovementId: null },
        orderBy: { entryDate: "desc" },
    });
};

export const listUnmatchedMovements = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    return prisma.cashMovement.findMany({
        where: { cashAccountId, reconciledAt: null },
        orderBy: { createdAt: "desc" },
    });
};

export const matchEntry = async ({ accountId, cashAccountId, entryId, movementId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);

    const [entry, movement] = await Promise.all([
        prisma.bankStatementEntry.findFirst({ where: { id: entryId, cashAccountId } }),
        prisma.cashMovement.findFirst({ where: { id: movementId, cashAccountId } }),
    ]);
    if (!entry) throw new ApiError(404, "Entrada de extracto no encontrada.");
    if (!movement) throw new ApiError(404, "Movimiento no encontrado.");
    if (entry.matchedMovementId) throw new ApiError(400, "Esta entrada ya fue conciliada.");
    if (movement.reconciledAt) throw new ApiError(400, "Este movimiento ya fue conciliado.");

    return prisma.$transaction(async (tx) => {
        await tx.cashMovement.update({ where: { id: movementId }, data: { reconciledAt: new Date() } });
        return tx.bankStatementEntry.update({ where: { id: entryId }, data: { matchedMovementId: movementId } });
    });
};
