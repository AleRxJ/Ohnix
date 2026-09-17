import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// These business records can own exactly one journal entry. Granular
// order_return/purchase_return events intentionally stay out: several valid
// partial-return postings may share the same order/purchase sourceId.
export const SINGLE_ENTRY_SOURCE_TYPES = new Set([
    "order_sale",
    "purchase",
    "order_payment",
    "purchase_payment",
    "customer_advance",
    "supplier_advance",
    "payment_credit_application",
    "order_cancellation",
    "credit_note_restock",
    "credit_note_financial",
    "period_close",
    "period_reopen",
    "period_reclose",
    "year_close",
    "year_reopen",
    "year_reclose",
    "inventory_adjustment",
    "transfer_discrepancy",
    "manual_journal",
    "manual_journal_reversal",
    "cash_transfer",
    "cash_adjustment",
    "opening_balance",
]);

export const isSingleEntrySource = (sourceType, sourceId) =>
    Boolean(sourceId) && SINGLE_ENTRY_SOURCE_TYPES.has(sourceType);

// Lazily creates the (tenant, year, month) AccountingPeriod a journal entry
// needs to post into - same "created on first use" idiom as
// pointOfSale.service.js#ensureDefaultPointOfSale. Always called from inside
// the same tx that's about to post into it.
export const getOrCreateAccountingPeriod = async (tx, { accountId, entryDate }) => {
    const year = entryDate.getUTCFullYear();
    const month = entryDate.getUTCMonth() + 1;

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

    // Safe retries should return the already-posted entry instead of writing
    // a duplicate. The partial unique index added with this change is the
    // concurrency backstop; this read handles the normal lost-response/retry
    // path without turning it into an error.
    if (isSingleEntrySource(sourceType, sourceId)) {
        const existing = await tx.journalEntry.findFirst({
            where: { sourceType, sourceId, period: { createdById: accountId } },
        });
        if (existing) return existing;
    }

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
            "The journal entry is unbalanced (debits do not equal credits).",
            [],
            "",
            "journal_entry_unbalanced"
        );
    }

    const period = await getOrCreateAccountingPeriod(tx, { accountId, entryDate });
    // A fiscal-year close/reopen/reclose is dated Dec 31 of the year it
    // affects (real-world "closing entries" convention: dated the fiscal
    // year's last day so an as-of-Dec-31 balance sheet already reflects it),
    // which always resolves to that year's December AccountingPeriod - one
    // fiscalYear.service.js#closeFiscalYear already requires to be closed
    // before it runs. Without this exemption no such entry could ever post.
    const isFiscalYearSourceType = sourceType === "year_close" || sourceType === "year_reopen" || sourceType === "year_reclose";
    if (period.status === "closed" && !isFiscalYearSourceType) {
        throw new ApiError(
            409,
            "The accounting period is closed for new entries.",
            [],
            "",
            "accounting_period_closed"
        );
    }
    if (period.reopenedUntil && period.reopenedUntil <= new Date() && sourceType !== "period_reclose") {
        throw new ApiError(
            409,
            "The authorized reopening window has expired.",
            [],
            "",
            "accounting_period_reopening_expired"
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
            thirdPartyType: l.thirdPartyType ?? null,
            thirdPartyId: l.thirdPartyId ?? null,
            thirdPartyName: l.thirdPartyName ?? null,
            thirdPartyDocument: l.thirdPartyDocument ?? null,
            costCenterId: l.costCenterId ?? null,
        })),
    });

    // Centralized immutable audit record: every posting path reaches this
    // function, so sales, purchases, payments, adjustments and opening
    // balances share the same trace without duplicating audit code.
    await tx.accountingConfigAudit.create({
        data: {
            accountId,
            actorId: createdById,
            entityType: "journal_entry",
            entityId: entry.id,
            action: "posted",
            after: {
                entry_date: entryDate.toISOString(),
                source_type: sourceType,
                source_id: sourceId ?? null,
                description: description ?? null,
                lines: nonZeroLines.map((line) => ({
                    chart_account_id: line.chartAccountId,
                    debit: Number(line.debit || 0),
                    credit: Number(line.credit || 0),
                    cost_center_id: line.costCenterId ?? null,
                    third_party_type: line.thirdPartyType ?? null,
                    third_party_id: line.thirdPartyId ?? null,
                    third_party_name: line.thirdPartyName ?? null,
                    third_party_document: line.thirdPartyDocument ?? null,
                    description: line.description ?? null,
                })),
            },
        },
    });

    return entry;
};

export const listJournalEntries = async ({ accountId, startDate, endDate, sourceType, sourceId, periodId, costCenterId }) =>
    prisma.journalEntry.findMany({
        where: {
            period: { createdById: accountId },
            ...(startDate || endDate
                ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                : {}),
            ...(sourceType ? { sourceType } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(periodId ? { periodId } : {}),
            ...(costCenterId ? { lines: { some: { costCenterId } } } : {}),
        },
        include: {
            lines: { include: { chartAccount: { select: { id: true, code: true, name: true } }, costCenter: true } },
        },
        orderBy: { entryDate: "desc" },
        take: 200,
    });

// Cheap existence checks for the Accounting page's onboarding banner (see
// accounting.controller.js#getAccountingStatus) - never call
// ensureDefaultChartOfAccounts from here, this must stay pure read-only.
export const hasAnyJournalEntry = async ({ accountId }) => {
    const entry = await prisma.journalEntry.findFirst({
        where: { period: { createdById: accountId } },
        select: { id: true },
    });
    return Boolean(entry);
};

// "[Histórico] " prefix is written by scripts/backfillAccountingHistory.js -
// its presence is the only signal (short of a schema change) that a company
// has backfilled history mixed into its ledger.
export const hasBackfilledJournalEntry = async ({ accountId }) => {
    const entry = await prisma.journalEntry.findFirst({
        where: { period: { createdById: accountId }, description: { startsWith: "[Histórico] " } },
        select: { id: true },
    });
    return Boolean(entry);
};

// "Libro mayor" for a single account: opening balance (everything before
// `startDate`) plus each line in range with a running balance, so the
// Chart of Accounts tab can show where a total actually came from without
// requiring a separate reconciliation step.
export const getAccountLedger = async ({ accountId, chartAccountId, startDate, endDate }) => {
    const account = await prisma.chartAccount.findFirst({ where: { id: chartAccountId, createdById: accountId } });
    if (!account) throw new ApiError(404, "Chart account not found.", [], "", "chart_account_not_found");

    const priorLines = startDate
        ? await prisma.journalEntryLine.findMany({
              where: {
                  chartAccountId,
                  journalEntry: { period: { createdById: accountId }, entryDate: { lt: startDate } },
              },
              select: { debit: true, credit: true },
          })
        : [];
    const openingBalance = priorLines.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0);

    const lines = await prisma.journalEntryLine.findMany({
        where: {
            chartAccountId,
            journalEntry: {
                period: { createdById: accountId },
                ...(startDate || endDate
                    ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                    : {}),
            },
        },
        include: { journalEntry: { select: { id: true, entryDate: true, description: true, sourceType: true } } },
        orderBy: { journalEntry: { entryDate: "asc" } },
    });

    let running = openingBalance;
    const movements = lines.map((l) => {
        running += Number(l.debit) - Number(l.credit);
        return {
            entry_id: l.journalEntry.id,
            date: l.journalEntry.entryDate,
            description: l.journalEntry.description,
            source_type: l.journalEntry.sourceType,
            debit: Number(l.debit),
            credit: Number(l.credit),
            running_balance: running,
        };
    });

    return {
        account: { id: account.id, code: account.code, name: account.name, account_type: account.accountType },
        opening_balance: openingBalance,
        closing_balance: running,
        movements,
    };
};

export const getJournalEntryById = async ({ accountId, id }) => {
    const entry = await prisma.journalEntry.findFirst({
        where: { id, period: { createdById: accountId } },
        include: {
            lines: { include: { chartAccount: { select: { id: true, code: true, name: true } }, costCenter: true } },
            period: { select: { id: true, year: true, month: true, status: true } },
        },
    });
    if (!entry) throw new ApiError(404, "Journal entry not found.", [], "", "journal_entry_not_found");
    return entry;
};
