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
    const periodKey = period.year * 12 + period.month;
    const currentPeriodKey = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
    if (periodKey >= currentPeriodKey) {
        throw new ApiError(400, "Solo se pueden cerrar periodos de meses anteriores.");
    }

    const startDate = new Date(Date.UTC(period.year, period.month - 1, 1));
    const endDate = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59, 999));

    try {
        return await prisma.$transaction(async (tx) => {
        // Re-read this exact period under a row lock. The earlier lookup is
        // useful for validation and date calculation, but cannot by itself
        // stop two concurrent requests from both observing "open".
        const lockedRows = await tx.$queryRaw`
            SELECT id, status
            FROM accounting_periods
            WHERE id = ${periodId} AND created_by = ${accountId}
            FOR UPDATE
        `;
        const lockedPeriod = lockedRows[0];
        if (!lockedPeriod) throw new ApiError(404, "Periodo contable no encontrado.");
        if (lockedPeriod.status === "closed") throw new ApiError(400, "Este periodo ya está cerrado.");

        const { reversalLines, netIncome } = await getPeriodClosingPlan({ accountId, startDate, endDate, db: tx });

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
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") {
            throw new ApiError(409, "El periodo fue modificado por otra operación concurrente. Actualiza e intenta de nuevo.");
        }
        throw error;
    }
};
