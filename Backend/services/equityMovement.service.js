import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { creditCashAccount, claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount, ensureCapitalContributionAccount, ensureRetainedEarningsAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { applyLocationCostCenter } from "./accountingPosting.service.js";

const round2 = (value) => Number(Number(value).toFixed(2));

// Fase 6 (estado de cambios en el patrimonio). Mirrors manualIncome.service.js
// almost exactly - same statementEntryId reconciliation support, same
// Serializable transaction - but credits 3115 "Aportes sociales" instead of a
// revenue account, and never decomposes VAT (a capital contribution isn't a
// taxable event).
export const registerCapitalContribution = async ({ accountId, actorId, amount, cashAccountId, description, contributionDate, statementEntryId = null }) => {
    const numericAmount = round2(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "Contribution amount must be greater than zero.", [], "", "capital_contribution_amount_invalid");
    }

    const entryDate = contributionDate ? new Date(contributionDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "Contribution date is invalid.", [], "", "capital_contribution_date_invalid");

    const [cashAccount, statementEntry] = await Promise.all([
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        statementEntryId ? prisma.bankStatementEntry.findFirst({ where: { id: statementEntryId, cashAccountId, matchedMovementId: null } }) : null,
    ]);
    if (!cashAccount) throw new ApiError(404, "Cash account not found or inactive.", [], "", "capital_contribution_cash_account_not_found");
    if (statementEntryId && !statementEntry) throw new ApiError(404, "Statement entry does not exist or is already reconciled.", [], "", "capital_contribution_statement_entry_unavailable");
    if (statementEntry && Math.abs(Number(statementEntry.amount) - numericAmount) >= 0.005) {
        throw new ApiError(422, "Bank income must exactly match the positive statement amount.", [], "", "capital_contribution_statement_amount_mismatch");
    }

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await creditCashAccount(tx, { cashAccountId, amount: numericAmount });
        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const capitalAccount = await ensureCapitalContributionAccount(tx, accountId);

        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate,
            description: description?.trim() || "Aporte de capital",
            sourceType: "capital_contribution",
            lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, [
                { chartAccountId: cashChartAccountId, debit: numericAmount, credit: 0 },
                { chartAccountId: capitalAccount.id, debit: 0, credit: numericAmount },
            ]),
        });
        const movement = await recordCashMovement(tx, {
            cashAccountId,
            delta: numericAmount,
            balanceAfter,
            sourceType: "capital_contribution",
            sourceId: entry.id,
            reason: description?.trim() || "Aporte de capital",
            createdById: actorId,
        });
        if (statementEntry) {
            const claim = await tx.bankStatementEntry.updateMany({ where: { id: statementEntry.id, matchedMovementId: null }, data: { matchedMovementId: movement.id } });
            if (claim.count !== 1) throw new ApiError(409, "The statement entry was reconciled in another session.", [], "", "capital_contribution_statement_concurrent_change");
            await tx.cashMovement.update({ where: { id: movement.id }, data: { reconciledAt: new Date() } });
        }
        return { entry, movement };
    }, { isolationLevel: "Serializable" });
};

// Mirrors manualExpense.service.js - debits 3605 "Utilidades acumuladas"
// instead of an expense account. Deliberately does not block the retained-
// earnings account from going negative (distributing more than what's
// actually been closed into it yet, e.g. before the fiscal year-end sweep
// runs) - same "flag it, don't block it" stance as other known gaps in this
// codebase; the accountant reviewing the balance sheet will see it.
export const registerEquityDistribution = async ({ accountId, actorId, amount, cashAccountId, description, distributionDate, statementEntryId = null }) => {
    const numericAmount = round2(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "Distribution amount must be greater than zero.", [], "", "equity_distribution_amount_invalid");
    }

    const entryDate = distributionDate ? new Date(distributionDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "Distribution date is invalid.", [], "", "equity_distribution_date_invalid");

    const [cashAccount, statementEntry] = await Promise.all([
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        statementEntryId ? prisma.bankStatementEntry.findFirst({ where: { id: statementEntryId, cashAccountId, matchedMovementId: null } }) : null,
    ]);
    if (!cashAccount) throw new ApiError(404, "Cash account not found or inactive.", [], "", "equity_distribution_cash_account_not_found");
    if (statementEntryId && !statementEntry) throw new ApiError(404, "Statement entry does not exist or is already reconciled.", [], "", "equity_distribution_statement_entry_unavailable");
    if (statementEntry && Math.abs(Number(statementEntry.amount) + numericAmount) >= 0.005) {
        throw new ApiError(422, "Bank charge must exactly match the negative statement amount.", [], "", "equity_distribution_statement_amount_mismatch");
    }

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount: numericAmount });
        if (balanceAfter === null) {
            throw new ApiError(422, "The selected cash account has insufficient funds.", [], "", "equity_distribution_insufficient_funds");
        }

        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const retainedEarningsAccount = await ensureRetainedEarningsAccount(tx, accountId);

        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate,
            description: description?.trim() || "Distribución de utilidades",
            sourceType: "equity_distribution",
            lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, [
                { chartAccountId: retainedEarningsAccount.id, debit: numericAmount, credit: 0 },
                { chartAccountId: cashChartAccountId, debit: 0, credit: numericAmount },
            ]),
        });
        const movement = await recordCashMovement(tx, {
            cashAccountId,
            delta: -numericAmount,
            balanceAfter,
            sourceType: "equity_distribution",
            sourceId: entry.id,
            reason: description?.trim() || "Distribución de utilidades",
            createdById: actorId,
        });
        if (statementEntry) {
            const claim = await tx.bankStatementEntry.updateMany({ where: { id: statementEntry.id, matchedMovementId: null }, data: { matchedMovementId: movement.id } });
            if (claim.count !== 1) throw new ApiError(409, "The statement entry was reconciled in another session.", [], "", "equity_distribution_statement_concurrent_change");
            await tx.cashMovement.update({ where: { id: movement.id }, data: { reconciledAt: new Date() } });
        }
        return { entry, movement };
    }, { isolationLevel: "Serializable" });
};
