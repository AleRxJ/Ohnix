import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { resolveLocationCostCenter } from "./accountingPosting.service.js";

export const transferCash = async ({ accountId, actorId, fromCashAccountId, toCashAccountId, amount, description, transferDate }) => {
    if (!fromCashAccountId || !toCashAccountId) throw new ApiError(400, "Las cuentas de origen y destino son obligatorias.");
    if (fromCashAccountId === toCashAccountId) throw new ApiError(422, "La cuenta de destino debe ser diferente a la cuenta de origen.");
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new ApiError(400, "El monto de la transferencia debe ser mayor a cero.");
    const entryDate = transferDate ? new Date(transferDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "La fecha de la transferencia no es válida.");

    const accounts = await prisma.cashAccount.findMany({ where: { id: { in: [fromCashAccountId, toCashAccountId] }, createdById: accountId, isActive: true } });
    const from = accounts.find((row) => row.id === fromCashAccountId);
    const to = accounts.find((row) => row.id === toCashAccountId);
    if (!from || !to) throw new ApiError(404, "Alguna de las cuentas no existe, está inactiva o no pertenece a la empresa.");
    const transferId = randomUUID();

    return prisma.$transaction(async (tx) => {
        const fromBalance = await claimCashAccount(tx, { cashAccountId: from.id, amount: numericAmount });
        if (fromBalance === null) throw new ApiError(422, "La cuenta de origen no tiene saldo suficiente.");
        const toBalance = await creditCashAccount(tx, { cashAccountId: to.id, amount: numericAmount });
        const [fromChartAccountId, toChartAccountId] = await Promise.all([
            resolveCashAccountChartAccount(tx, accountId, from),
            resolveCashAccountChartAccount(tx, accountId, to),
        ]);
        const [fromCostCenterId, toCostCenterId] = await Promise.all([
            resolveLocationCostCenter(tx, accountId, from.pointOfSaleId),
            resolveLocationCostCenter(tx, accountId, to.pointOfSaleId),
        ]);
        const reason = description?.trim() || `Transferencia de ${from.name} a ${to.name}`;
        const entry = await recordJournalEntry(tx, {
            accountId, createdById: actorId, entryDate, description: reason,
            sourceType: "cash_transfer", sourceId: transferId,
            lines: [
                { chartAccountId: toChartAccountId, debit: numericAmount, credit: 0, description: `Entrada a ${to.name}`, costCenterId: toCostCenterId },
                { chartAccountId: fromChartAccountId, debit: 0, credit: numericAmount, description: `Salida de ${from.name}`, costCenterId: fromCostCenterId },
            ],
        });
        const [outMovement, inMovement] = await Promise.all([
            recordCashMovement(tx, { cashAccountId: from.id, delta: -numericAmount, balanceAfter: fromBalance, sourceType: "transfer_out", sourceId: transferId, reason, createdById: actorId }),
            recordCashMovement(tx, { cashAccountId: to.id, delta: numericAmount, balanceAfter: toBalance, sourceType: "transfer_in", sourceId: transferId, reason, createdById: actorId }),
        ]);
        return { transferId, entry, outMovement, inMovement };
    }, { isolationLevel: "Serializable" });
};
