import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Lazily creates the (tenant, year, month) AccountingPeriod a journal entry
// needs to post into - same "created on first use" idiom as
// pointOfSale.service.js#ensureDefaultPointOfSale. Always called from inside
// the same tx that's about to post into it.
export const getOrCreateAccountingPeriod = async (tx, { accountId, entryDate }) => {
    const year = entryDate.getFullYear();
    const month = entryDate.getMonth() + 1;

    const existing = await tx.accountingPeriod.findUnique({
        where: { createdById_year_month: { createdById: accountId, year, month } },
    });
    if (existing) return existing;

    return tx.accountingPeriod.create({ data: { createdById: accountId, year, month } });
};

// Single write path for the double-entry ledger - mirror of
// cashMovement.service.js#recordCashMovement/stockMovement.service.js#recordStockMovement,
// except a journal entry only means something as a balanced SET of lines
// (debits === credits), not a single delta. Every automatic posting call
// (accountingPosting.service.js) must run inside the same transaction as the
// sale/purchase/payment it accounts for - a journal entry is the
// authoritative internal record, same as StockMovement/CashMovement, not a
// best-effort side call like electronic invoicing.
//
// `lines` is [{ chartAccountId, debit, credit, description? }]. Zero-value
// lines are dropped (e.g. a $0 IVA line when a company isn't VAT
// responsible); if everything nets to zero, nothing is created at all
// rather than a degenerate empty-looking entry.
export const recordJournalEntry = async (
    tx,
    { accountId, createdById, entryDate, description, sourceType, sourceId, lines }
) => {
    const nonZeroLines = lines.filter((l) => Number(l.debit || 0) !== 0 || Number(l.credit || 0) !== 0);
    if (nonZeroLines.length === 0) return null;

    // Compare cents as integers, not Decimal/Number, to avoid float drift -
    // every amount reaching here is already .toFixed(2)-rounded upstream, so
    // this should never actually fire; it's a backstop against a future
    // posting composer that forgets to balance itself, not a normal-path
    // validation.
    const toCents = (n) => Math.round(Number(n) * 100);
    const totalDebit = nonZeroLines.reduce((sum, l) => sum + toCents(l.debit || 0), 0);
    const totalCredit = nonZeroLines.reduce((sum, l) => sum + toCents(l.credit || 0), 0);
    if (totalDebit !== totalCredit) {
        throw new ApiError(
            500,
            "El asiento contable no cuadra (débitos ≠ créditos).",
            [],
            "",
            "journal_entry_unbalanced"
        );
    }

    const period = await getOrCreateAccountingPeriod(tx, { accountId, entryDate });
    if (period.status === "closed") {
        throw new ApiError(
            409,
            "El periodo contable está cerrado para nuevos movimientos.",
            [],
            "",
            "accounting_period_closed"
        );
    }

    const entry = await tx.journalEntry.create({
        data: {
            periodId: period.id,
            entryDate,
            description: description ?? null,
            sourceType,
            sourceId: sourceId ?? null,
            createdById,
        },
    });

    await tx.journalEntryLine.createMany({
        data: nonZeroLines.map((l) => ({
            journalEntryId: entry.id,
            chartAccountId: l.chartAccountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description ?? null,
        })),
    });

    return entry;
};

export const listJournalEntries = async ({ accountId, startDate, endDate, sourceType, sourceId, periodId }) =>
    prisma.journalEntry.findMany({
        where: {
            period: { createdById: accountId },
            ...(startDate || endDate
                ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                : {}),
            ...(sourceType ? { sourceType } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(periodId ? { periodId } : {}),
        },
        include: {
            lines: { include: { chartAccount: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { entryDate: "desc" },
        take: 200,
    });

export const getJournalEntryById = async ({ accountId, id }) => {
    const entry = await prisma.journalEntry.findFirst({
        where: { id, period: { createdById: accountId } },
        include: {
            lines: { include: { chartAccount: { select: { id: true, code: true, name: true } } } },
            period: { select: { id: true, year: true, month: true, status: true } },
        },
    });
    if (!entry) throw new ApiError(404, "Asiento contable no encontrado.");
    return entry;
};
