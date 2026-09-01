import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { creditCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const registerManualIncome = async ({ accountId, actorId, amount, revenueAccountId, cashAccountId, description, incomeDate, statementEntryId = null }) => {
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new ApiError(400, "El monto del ingreso debe ser mayor a cero.");

    const entryDate = incomeDate ? new Date(incomeDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "La fecha del ingreso no es válida.");

    const [revenueAccount, cashAccount, statementEntry] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: revenueAccountId, createdById: accountId, accountType: "revenue", isActive: true } }),
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        statementEntryId ? prisma.bankStatementEntry.findFirst({ where: { id: statementEntryId, cashAccountId, matchedMovementId: null } }) : null,
    ]);
    if (!revenueAccount) throw new ApiError(404, "Cuenta de ingreso no encontrada o inactiva.");
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada o inactiva.");
    if (statementEntryId && !statementEntry) throw new ApiError(404, "La entrada del extracto no existe o ya fue conciliada.");
    if (statementEntry && Math.abs(Number(statementEntry.amount) - numericAmount) >= 0.005) {
        throw new ApiError(422, "El ingreso bancario debe coincidir exactamente con el valor positivo del extracto.");
    }

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await creditCashAccount(tx, { cashAccountId, amount: numericAmount });
        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate,
            description: description?.trim() || "Ingreso manual",
            sourceType: "manual_income",
            lines: [
                { chartAccountId: cashChartAccountId, debit: numericAmount, credit: 0 },
                { chartAccountId: revenueAccount.id, debit: 0, credit: numericAmount },
            ],
        });
        const movement = await recordCashMovement(tx, {
            cashAccountId,
            delta: numericAmount,
            balanceAfter,
            sourceType: "manual_deposit",
            sourceId: entry.id,
            reason: description?.trim() || "Ingreso manual",
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
