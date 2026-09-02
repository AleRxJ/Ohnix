import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { applyLocationCostCenter } from "./accountingPosting.service.js";

export const adjustCash = async ({ accountId, actorId, cashAccountId, counterpartAccountId, amount, reason, adjustmentDate }) => {
    if (!cashAccountId || !counterpartAccountId) throw new ApiError(400, "La cuenta de caja/banco y la contrapartida son obligatorias.");
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount === 0) throw new ApiError(400, "El ajuste debe ser diferente de cero.");
    if (!reason?.trim()) throw new ApiError(400, "El motivo del ajuste es obligatorio.");
    const entryDate = adjustmentDate ? new Date(adjustmentDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "La fecha del ajuste no es válida.");

    const [cashAccount, counterpart] = await Promise.all([
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        prisma.chartAccount.findFirst({ where: { id: counterpartAccountId, createdById: accountId, isActive: true } }),
    ]);
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada o inactiva.");
    if (!counterpart) throw new ApiError(404, "Cuenta contable de contrapartida no encontrada o inactiva.");
    const adjustmentId = randomUUID();
    const absoluteAmount = Math.abs(numericAmount);

    return prisma.$transaction(async (tx) => {
        const balanceAfter = numericAmount > 0
            ? await creditCashAccount(tx, { cashAccountId, amount: absoluteAmount })
            : await claimCashAccount(tx, { cashAccountId, amount: absoluteAmount });
        if (balanceAfter === null) throw new ApiError(422, "El ajuste dejaría la cuenta con saldo negativo.");
        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        if (cashChartAccountId === counterpart.id) throw new ApiError(422, "La contrapartida debe ser diferente de la cuenta contable de caja/banco.");
        const entry = await recordJournalEntry(tx, {
            accountId, createdById: actorId, entryDate, description: reason.trim(), sourceType: "cash_adjustment", sourceId: adjustmentId,
            lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, numericAmount > 0
                ? [{ chartAccountId: cashChartAccountId, debit: absoluteAmount, credit: 0 }, { chartAccountId: counterpart.id, debit: 0, credit: absoluteAmount }]
                : [{ chartAccountId: counterpart.id, debit: absoluteAmount, credit: 0 }, { chartAccountId: cashChartAccountId, debit: 0, credit: absoluteAmount }]),
        });
        const movement = await recordCashMovement(tx, { cashAccountId, delta: numericAmount, balanceAfter, sourceType: "adjustment", sourceId: adjustmentId, reason: reason.trim(), createdById: actorId });
        return { adjustmentId, entry, movement };
    }, { isolationLevel: "Serializable" });
};
