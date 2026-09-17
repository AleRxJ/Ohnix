import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { resolveLocationCostCenter } from "./accountingPosting.service.js";

export const transferCash = async ({ accountId, actorId, fromCashAccountId, toCashAccountId, amount, description, transferDate }) => {
    if (!fromCashAccountId || !toCashAccountId) throw new ApiError(400, "Source and destination accounts are required.", [], "", "cash_transfer_accounts_required");
    if (fromCashAccountId === toCashAccountId) throw new ApiError(422, "Destination must differ from source.", [], "", "cash_transfer_same_account");
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new ApiError(400, "Transfer amount must be greater than zero.", [], "", "cash_transfer_amount_invalid");
    const entryDate = transferDate ? new Date(transferDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "Transfer date is invalid.", [], "", "cash_transfer_date_invalid");

    const accounts = await prisma.cashAccount.findMany({ where: { id: { in: [fromCashAccountId, toCashAccountId] }, createdById: accountId, isActive: true } });
    const from = accounts.find((row) => row.id === fromCashAccountId);
    const to = accounts.find((row) => row.id === toCashAccountId);
    if (!from || !to) throw new ApiError(404, "An account was not found, is inactive, or belongs to another company.", [], "", "cash_transfer_account_not_found");
    const transferId = randomUUID();

    return prisma.$transaction(async (tx) => {
        const fromBalance = await claimCashAccount(tx, { cashAccountId: from.id, amount: numericAmount });
        if (fromBalance === null) throw new ApiError(422, "The source account has insufficient funds.", [], "", "cash_transfer_insufficient_funds");
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
