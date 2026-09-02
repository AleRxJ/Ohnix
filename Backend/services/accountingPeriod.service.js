import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureRetainedEarningsAccount } from "./chartOfAccounts.service.js";
import { getPeriodClosingPlan } from "./financialStatements.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { getCashIntegrity } from "./cashIntegrity.service.js";

export const listAccountingPeriods = async (accountId) =>
    prisma.accountingPeriod.findMany({
        where: { createdById: accountId },
        include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
    });

export const getAccountingPeriodCloseReadiness = async ({ accountId, periodId, db = prisma }) => {
    const period = await db.accountingPeriod.findFirst({ where: { id: periodId, createdById: accountId } });
    if (!period) throw new ApiError(404, "Periodo contable no encontrado.");
    const startDate = new Date(Date.UTC(period.year, period.month - 1, 1));
    const endDate = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59, 999));
    const [integrity, unmatchedStatementEntries, unmatchedCashMovements] = await Promise.all([
        getCashIntegrity({ accountId, db }),
        db.bankStatementEntry.count({ where: { cashAccount: { createdById: accountId }, entryDate: { gte: startDate, lte: endDate }, matchedMovementId: null } }),
        db.cashMovement.count({ where: { cashAccount: { createdById: accountId }, createdAt: { gte: startDate, lte: endDate }, reconciledAt: null } }),
    ]);
    const operationalDifferences = integrity.operational.filter((row) => row.status !== "ok");
    return {
        period: { id: period.id, year: period.year, month: period.month, status: period.status },
        can_close: operationalDifferences.length === 0,
        blockers: { operational_differences: operationalDifferences },
        warnings: { unmatched_statement_entries: unmatchedStatementEntries, unmatched_cash_movements: unmatchedCashMovements, accounting_differences: integrity.accounting.filter((row) => row.status !== "ok") },
    };
};

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
            SELECT id, status, reopened_until
            FROM accounting_periods
            WHERE id = ${periodId} AND created_by = ${accountId}
            FOR UPDATE
        `;
        const lockedPeriod = lockedRows[0];
        if (!lockedPeriod) throw new ApiError(404, "Periodo contable no encontrado.");
        if (lockedPeriod.status === "closed") throw new ApiError(400, "Este periodo ya está cerrado.");

        const readiness = await getAccountingPeriodCloseReadiness({ accountId, periodId, db: tx });
        if (!readiness.can_close) throw new ApiError(422, "No se puede cerrar el periodo: existen diferencias entre saldos de caja/banco y sus movimientos.", [], "", "accounting_period_integrity_blocked");

        const activeReopening = await tx.accountingPeriodReopening.findFirst({
            where: { periodId, reclosedAt: null },
            orderBy: { reopenedAt: "desc" },
        });
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
                sourceType: activeReopening ? "period_reclose" : "period_close",
                sourceId: activeReopening?.id || period.id,
                lines,
            });
        }

        if (activeReopening) {
            await tx.accountingPeriodReopening.update({
                where: { id: activeReopening.id },
                data: { reclosedAt: new Date(), reclosedById: actorId },
            });
        }
        return tx.accountingPeriod.update({
            where: { id: periodId },
            data: { status: "closed", closedAt: new Date(), closedById: actorId, reopenedUntil: null },
        });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") {
            throw new ApiError(409, "El periodo fue modificado por otra operación concurrente. Actualiza e intenta de nuevo.");
        }
        throw error;
    }
};

export const reopenAccountingPeriod = async ({ accountId, actorId, periodId, reason, durationHours = 24 }) => {
    const trimmedReason = String(reason || "").trim();
    const hours = Number(durationHours);
    if (!trimmedReason) throw new ApiError(400, "El motivo de reapertura es obligatorio.");
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        throw new ApiError(400, "La ventana de reapertura debe estar entre 1 y 168 horas.");
    }

    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
            SELECT id, status, year, month
            FROM accounting_periods
            WHERE id = ${periodId} AND created_by = ${accountId}
            FOR UPDATE
        `;
        const period = rows[0];
        if (!period) throw new ApiError(404, "Periodo contable no encontrado.");
        if (period.status !== "closed") throw new ApiError(409, "Solo se puede reabrir un periodo cerrado.");

        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        const reopening = await tx.accountingPeriodReopening.create({
            data: { periodId, reason: trimmedReason, reopenedById: actorId, expiresAt },
        });
        await tx.accountingPeriod.update({ where: { id: periodId }, data: { status: "open", reopenedUntil: expiresAt } });

        const latestClosingEntry = await tx.journalEntry.findFirst({
            where: { periodId, sourceType: { in: ["period_close", "period_reclose"] } },
            include: { lines: true },
            orderBy: { createdAt: "desc" },
        });
        if (latestClosingEntry) {
            const endDate = new Date(Date.UTC(Number(period.year), Number(period.month), 0, 23, 59, 59, 999));
            await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: endDate,
                description: `Reapertura del periodo ${String(period.month).padStart(2, "0")}/${period.year}: ${trimmedReason}`,
                sourceType: "period_reopen",
                sourceId: reopening.id,
                lines: latestClosingEntry.lines.map((line) => ({
                    chartAccountId: line.chartAccountId,
                    debit: Number(line.credit),
                    credit: Number(line.debit),
                    description: line.description,
                })),
            });
        }
        return tx.accountingPeriod.findUniqueOrThrow({
            where: { id: periodId },
            include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
        });
    }, { isolationLevel: "Serializable" });
};
