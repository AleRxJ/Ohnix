import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { getChartAccountMap, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { applyLocationCostCenter, decomposeInclusiveTax } from "./accountingPosting.service.js";

export const registerManualExpense = async ({ accountId, actorId, amount, expenseAccountId, cashAccountId, description, expenseDate, statementEntryId = null, taxTreatment = "excluded", taxRate = 0 }) => {
    const numericAmount = Number(Number(amount).toFixed(2));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "El monto del gasto debe ser mayor a cero.");
    }

    const entryDate = expenseDate ? new Date(expenseDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) {
        throw new ApiError(400, "La fecha del gasto no es válida.");
    }

    const [expenseAccount, cashAccount, statementEntry, owner] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: expenseAccountId, createdById: accountId, accountType: "expense", isActive: true } }),
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
        statementEntryId ? prisma.bankStatementEntry.findFirst({ where: { id: statementEntryId, cashAccountId, matchedMovementId: null } }) : null,
        prisma.user.findUnique({ where: { id: accountId }, select: { company: { select: { vatResponsible: true } } } }),
    ]);
    if (!expenseAccount) throw new ApiError(404, "Cuenta de gasto no encontrada o inactiva.");
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada o inactiva.");
    if (statementEntryId && !statementEntry) throw new ApiError(404, "La entrada del extracto no existe o ya fue conciliada.");
    if (statementEntry && Math.abs(Number(statementEntry.amount) + numericAmount) >= 0.005) {
        throw new ApiError(422, "El cargo bancario debe coincidir exactamente con el valor negativo del extracto.");
    }

    // A company that isn't VAT-responsible can't credit input VAT on
    // anything, same gate purchase.service.js#computePurchaseItemTax applies
    // - enforced here regardless of what the caller sent, not just in the UI.
    const companyCollectsVat = owner?.company?.vatResponsible !== "not_responsible";
    const effectiveTreatment = companyCollectsVat ? taxTreatment : "excluded";
    // numericAmount is the TOTAL that actually leaves the cash account - the
    // expense account only ever gets the pre-tax base; the difference is the
    // deductible input VAT line below, so the two together still sum back to
    // numericAmount and the entry balances.
    const { base, taxAmount } = decomposeInclusiveTax(numericAmount, effectiveTreatment, taxRate);

    return prisma.$transaction(async (tx) => {
        const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount: numericAmount });
        if (balanceAfter === null) {
            throw new ApiError(422, "Saldo insuficiente en la cuenta de caja/banco seleccionada.");
        }

        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const vatDeductibleAccountId = taxAmount > 0 ? (await getChartAccountMap(tx, accountId)).get("240810").id : null;
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate,
            description: description?.trim() || "Gasto manual",
            sourceType: "manual_expense",
            lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, [
                { chartAccountId: expenseAccount.id, debit: base, credit: 0 },
                ...(taxAmount > 0 ? [{ chartAccountId: vatDeductibleAccountId, debit: taxAmount, credit: 0 }] : []),
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
