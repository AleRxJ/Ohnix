import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureRetainedEarningsAccount } from "./chartOfAccounts.service.js";
import { getPeriodClosingPlan } from "./financialStatements.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const listAccountingPeriods = async (accountId) =>
    prisma.accountingPeriod.findMany({
        where: { createdById: accountId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
    });

// Only a period strictly before the current calendar month can be closed -
// this structurally prevents the one real accident this feature could cause
// (a closed period blocking new sales/purchases/payments): postings are
// always dated "now" (order.orderDate/purchase.purchaseDate/payment.paidAt),
// so the only period ever open for new business is the current one. Closing
// only ever applies to a month that's already in the past, which is exactly
// what "closing the books" is supposed to mean.
// Posts the closing entry (reverses that period's revenue/cost/expense
// activity into "Utilidades acumuladas") and locks the period in the same
// transaction, so a period is never left half-closed if either step fails.
// See financialStatements.service.js#getPeriodClosingPlan/getIncomeStatement
// for how the reversal keeps that period's own P&L reading correctly
// afterward instead of appearing to net to zero.
export const closeAccountingPeriod = async ({ accountId, actorId, periodId }) => {
    const period = await prisma.accountingPeriod.findFirst({ where: { id: periodId, createdById: accountId } });
    if (!period) throw new ApiError(404, "Periodo contable no encontrado.");
    if (period.status === "closed") throw new ApiError(400, "Este periodo ya está cerrado.");

    const now = new Date();
    if (period.year === now.getUTCFullYear() && period.month === now.getUTCMonth() + 1) {
        throw new ApiError(400, "No se puede cerrar el periodo del mes en curso.");
    }

    const startDate = new Date(Date.UTC(period.year, period.month - 1, 1));
    const endDate = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59, 999));

    return prisma.$transaction(async (tx) => {
        const { reversalLines, netIncome } = await getPeriodClosingPlan({ accountId, startDate, endDate });

        if (reversalLines.length > 0 || netIncome !== 0) {
            const retainedEarnings = await ensureRetainedEarningsAccount(tx, accountId);
            const lines = [
                ...reversalLines,
                {
                    chartAccountId: retainedEarnings.id,
                    debit: netIncome < 0 ? Math.abs(netIncome) : 0,
                    credit: netIncome > 0 ? netIncome : 0,
                },
            ];

            await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: endDate,
                description: `Cierre del periodo ${String(period.month).padStart(2, "0")}/${period.year}`,
                sourceType: "period_close",
                sourceId: period.id,
                lines,
            });
        }

        return tx.accountingPeriod.update({
            where: { id: periodId },
            data: { status: "closed", closedAt: new Date(), closedById: actorId },
        });
    });
};
