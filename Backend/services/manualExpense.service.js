import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { applyLocationCostCenter } from "./accountingPosting.service.js";

export const registerManualExpense = async ({ accountId, actorId, amount, expenseAccountId, cashAccountId, description, expenseDate, statementEntryId = null }) => {
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "El monto del gasto debe ser mayor a cero.");
    }

    const entryDate = expenseDate ? new Date(expenseDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) {
        throw new ApiError(400, "La fecha del gasto no es válida.");
    }

    const [expenseAccount, cashAccount, statementEntry] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: expenseAccountId, createdById: accountId, accountType: "expense", isActive: true } }),
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        statementEntryId ? prisma.bankStatementEntry.findFirst({ where: { id: statementEntryId, cashAccountId, matchedMovementId: null } }) : null,
    ]);
    if (!expenseAccount) throw new ApiError(404, "Cuenta de gasto no encontrada o inactiva.");
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada o inactiva.");
    if (statementEntryId && !statementEntry) throw new ApiError(404, "La entrada del extracto no existe o ya fue conciliada.");
    if (statementEntry && Math.abs(Number(statementEntry.amount) + numericAmount) >= 0.005) {
        throw new ApiError(422, "El cargo bancario debe coincidir exactamente con el valor negativo del extracto.");
    }

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount: numericAmount });
        if (balanceAfter === null) {
            throw new ApiError(422, "Saldo insuficiente en la cuenta de caja/banco seleccionada.");
        }

        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate,
            description: description?.trim() || "Gasto manual",
            sourceType: "manual_expense",
            lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, [
                { chartAccountId: expenseAccount.id, debit: numericAmount, credit: 0 },
                { chartAccountId: cashChartAccountId, debit: 0, credit: numericAmount },
            ]),
        });

        const movement = await recordCashMovement(tx, {
            cashAccountId,
            delta: -numericAmount,
            balanceAfter,
            sourceType: "manual_withdrawal",
            sourceId: entry.id,
            reason: description?.trim() || "Gasto manual",
            createdById: actorId,
        });

        if (statementEntry) {
            const claim = await tx.bankStatementEntry.updateMany({ where: { id: statementEntry.id, matchedMovementId: null }, data: { matchedMovementId: movement.id } });
            if (claim.count !== 1) throw new ApiError(409, "La entrada fue conciliada en otra sesión.");
            await tx.cashMovement.update({ where: { id: movement.id }, data: { reconciledAt: new Date() } });
        }

        return { entry, movement };
    }, { isolationLevel: "Serializable" });
};
