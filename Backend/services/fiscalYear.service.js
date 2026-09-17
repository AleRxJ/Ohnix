import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureCurrentYearEarningsAccount, ensureRetainedEarningsAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const yearEndDate = (year) => new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

const validateYear = (year) => {
    const now = new Date();
    if (!Number.isInteger(year) || year < 2000 || year > now.getUTCFullYear()) {
        throw new ApiError(400, "Invalid fiscal year.", [], "", "fiscal_year_invalid");
    }
    if (year >= now.getUTCFullYear()) {
        throw new ApiError(400, "Only a fully elapsed fiscal year may be closed.", [], "", "fiscal_year_not_elapsed");
    }
};

// A month with no activity never gets an AccountingPeriod row at all
// (getOrCreateAccountingPeriod is lazy) - such a month can't block the year,
// it simply has nothing to close. Only a month that has a row AND isn't
// `closed` blocks (someone posted into it but never closed it).
const getOpenMonths = async (db, accountId, year) => {
    const periods = await db.accountingPeriod.findMany({
        where: { createdById: accountId, year, month: { gte: 1, lte: 12 } },
        select: { month: true, status: true },
    });
    return periods.filter((p) => p.status !== "closed").map((p) => p.month).sort((a, b) => a - b);
};

export const listFiscalYearClosures = async (accountId) =>
    prisma.fiscalYearClosure.findMany({
        where: { createdById: accountId },
        include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
        orderBy: { year: "desc" },
    });

export const getFiscalYearCloseReadiness = async ({ accountId, year }) => {
    const now = new Date();
    const openMonths = await getOpenMonths(prisma, accountId, year);
    const closure = await prisma.fiscalYearClosure.findFirst({
        where: { createdById: accountId, year },
        include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
    });
    const yearElapsed = year < now.getUTCFullYear();

    return {
        year,
        year_elapsed: yearElapsed,
        open_months: openMonths,
        closure,
        can_close: yearElapsed && openMonths.length === 0 && (!closure || closure.status === "reopened"),
    };
};

// Sweeps "Utilidad del ejercicio" (3610 - what every month of `year` already
// posted its net result into, see accountingPeriod.service.js#closeAccountingPeriod)
// into "Utilidades acumuladas" (3605), and locks the year. Requires every
// month of `year` that ever had activity to already be individually closed -
// this never re-derives or re-reverses revenue/cost/expense activity itself,
// it only moves the balance the monthly closes already accumulated, so it
// can't double-count or drift from what those already posted.
export const closeFiscalYear = async ({ accountId, actorId, year }) => {
    validateYear(year);

    try {
        return await prisma.$transaction(async (tx) => {
        const openMonths = await getOpenMonths(tx, accountId, year);
        if (openMonths.length > 0) {
            throw new ApiError(
                422,
                `The following months of ${year} are not closed yet: ${openMonths.join(", ")}.`,
                [],
                "",
                "fiscal_year_months_not_closed"
            );
        }

        const existing = await tx.fiscalYearClosure.findFirst({ where: { createdById: accountId, year } });
        const activeReopening = existing
            ? await tx.fiscalYearReopening.findFirst({ where: { closureId: existing.id, reclosedAt: null }, orderBy: { reopenedAt: "desc" } })
            : null;
        if (existing && !activeReopening) {
            throw new ApiError(400, `Fiscal year ${year} is already closed.`, [], "", "fiscal_year_already_closed");
        }

        const currentYearEarnings = await ensureCurrentYearEarningsAccount(tx, accountId);
        const retainedEarnings = await ensureRetainedEarningsAccount(tx, accountId);

        const endDate = yearEndDate(year);
        const activity = await tx.journalEntryLine.groupBy({
            by: ["chartAccountId"],
            where: {
                chartAccountId: currentYearEarnings.id,
                journalEntry: { period: { createdById: accountId }, entryDate: { lte: endDate } },
            },
            _sum: { debit: true, credit: true },
        });
        // Equity is credit-normal (balanceForType in financialStatements.service.js) -
        // a positive balance is a net credit (accumulated profit) and needs a
        // debit to zero it; a negative balance (accumulated loss) needs a credit.
        const balance = round2(Number(activity[0]?._sum.credit || 0) - Number(activity[0]?._sum.debit || 0));

        const closure = existing
            ? await tx.fiscalYearClosure.update({ where: { id: existing.id }, data: { status: "closed", closedById: actorId, closedAt: new Date(), reopenedUntil: null } })
            : await tx.fiscalYearClosure.create({ data: { createdById: accountId, year, status: "closed", closedById: actorId } });

        if (balance !== 0) {
            await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: endDate,
                description: `Cierre del ejercicio ${year}`,
                sourceType: activeReopening ? "year_reclose" : "year_close",
                sourceId: activeReopening ? activeReopening.id : closure.id,
                lines: [
                    { chartAccountId: currentYearEarnings.id, debit: balance > 0 ? balance : 0, credit: balance < 0 ? -balance : 0 },
                    { chartAccountId: retainedEarnings.id, debit: balance < 0 ? -balance : 0, credit: balance > 0 ? balance : 0 },
                ],
            });
        }

        if (activeReopening) {
            await tx.fiscalYearReopening.update({ where: { id: activeReopening.id }, data: { reclosedAt: new Date(), reclosedById: actorId } });
        }

        return tx.fiscalYearClosure.findUniqueOrThrow({
            where: { id: closure.id },
            include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
        });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2002") {
            throw new ApiError(400, `Fiscal year ${year} is already closed.`, [], "", "fiscal_year_already_closed");
        }
        if (error?.code === "P2034") {
            throw new ApiError(409, "The fiscal year closure was changed by another operation.", [], "", "fiscal_year_concurrent_change");
        }
        throw error;
    }
};

export const reopenFiscalYear = async ({ accountId, actorId, year, reason, durationHours = 24 }) => {
    const trimmedReason = String(reason || "").trim();
    const hours = Number(durationHours);
    if (!trimmedReason) throw new ApiError(400, "A reopening reason is required.", [], "", "fiscal_year_reopen_reason_required");
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        throw new ApiError(400, "The reopening window must be between 1 and 168 hours.", [], "", "fiscal_year_reopen_duration_invalid");
    }

    return prisma.$transaction(async (tx) => {
        const closure = await tx.fiscalYearClosure.findFirst({ where: { createdById: accountId, year } });
        if (!closure) throw new ApiError(404, "Fiscal year closure not found.", [], "", "fiscal_year_not_found");
        if (closure.status !== "closed") throw new ApiError(409, "Only a closed fiscal year may be reopened.", [], "", "fiscal_year_not_closed");

        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        const reopening = await tx.fiscalYearReopening.create({
            data: { closureId: closure.id, reason: trimmedReason, reopenedById: actorId, expiresAt },
        });
        await tx.fiscalYearClosure.update({ where: { id: closure.id }, data: { status: "reopened", reopenedUntil: expiresAt } });

        const priorReopeningIds = (
            await tx.fiscalYearReopening.findMany({ where: { closureId: closure.id }, select: { id: true } })
        ).map((r) => r.id);
        const latestClosingEntry = await tx.journalEntry.findFirst({
            where: { sourceType: { in: ["year_close", "year_reclose"] }, sourceId: { in: [closure.id, ...priorReopeningIds] } },
            include: { lines: true },
            orderBy: { createdAt: "desc" },
        });
        if (latestClosingEntry) {
            await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: yearEndDate(year),
                description: `Reapertura del cierre del ejercicio ${year}: ${trimmedReason}`,
                sourceType: "year_reopen",
                sourceId: reopening.id,
                lines: latestClosingEntry.lines.map((line) => ({
                    chartAccountId: line.chartAccountId,
                    debit: Number(line.credit),
                    credit: Number(line.debit),
                    description: line.description,
                })),
            });
        }

        return tx.fiscalYearClosure.findUniqueOrThrow({
            where: { id: closure.id },
            include: { reopenings: { orderBy: { reopenedAt: "desc" } } },
        });
    }, { isolationLevel: "Serializable" });
};
