import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as chartOfAccountsService from "../services/chartOfAccounts.service.js";
import * as journalEntryService from "../services/journalEntry.service.js";
import * as accountingPeriodService from "../services/accountingPeriod.service.js";
import * as financialStatementsService from "../services/financialStatements.service.js";

// `to`/`as_of` always arrives as a plain "YYYY-MM-DD" string (every date
// picker on the frontend sends dayjs().format("YYYY-MM-DD")), which
// `new Date(...)` parses as UTC midnight - a raw `lte` against that would
// silently exclude every entry from later that same day. This pushes the
// boundary to the last instant of that date so "hasta hoy"/"a hoy" actually
// includes today's own transactions, not just up to midnight this morning.
const endOfDay = (dateString) => {
    if (!dateString) return undefined;
    const d = new Date(dateString);
    d.setUTCHours(23, 59, 59, 999);
    return d;
};

const mapChartAccount = (a) => ({
    _id: a.id,
    code: a.code,
    name: a.name,
    account_type: a.accountType,
    parent_id: a.parentId,
    is_active: a.isActive,
});

const mapJournalEntry = (e) => ({
    _id: e.id,
    entry_date: e.entryDate,
    description: e.description,
    source_type: e.sourceType,
    source_id: e.sourceId,
    period: e.period ? { _id: e.period.id, year: e.period.year, month: e.period.month, status: e.period.status } : undefined,
    lines: e.lines.map((l) => ({
        _id: l.id,
        chart_account: { _id: l.chartAccount.id, code: l.chartAccount.code, name: l.chartAccount.name },
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
    })),
});

const mapPeriod = (p) => ({
    _id: p.id,
    year: p.year,
    month: p.month,
    status: p.status,
    closed_at: p.closedAt,
});

export const listChartOfAccounts = asyncHandler(async (req, res) => {
    const accounts = await chartOfAccountsService.listChartAccounts(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, accounts.map(mapChartAccount), "Chart of accounts fetched successfully"));
});

export const createChartOfAccount = asyncHandler(async (req, res) => {
    const { code, name, account_type, parent_id } = req.body || {};
    const account = await chartOfAccountsService.createChartAccount(req.user.prismaId, {
        code,
        name,
        accountType: account_type,
        parentId: parent_id || undefined,
    });
    return res.status(201).json(new ApiResponse(201, mapChartAccount(account), "Chart account created successfully"));
});

export const setChartOfAccountActive = asyncHandler(async (req, res, next) => {
    const { is_active } = req.body || {};
    if (typeof is_active !== "boolean") return next(new ApiError(400, "is_active debe ser verdadero o falso."));

    const account = await chartOfAccountsService.setChartAccountActive(req.user.prismaId, req.params.id, is_active);
    return res.status(200).json(new ApiResponse(200, mapChartAccount(account), "Chart account updated successfully"));
});

export const listJournalEntries = asyncHandler(async (req, res) => {
    const { from, to, source_type, source_id, period_id } = req.query;
    const entries = await journalEntryService.listJournalEntries({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
        sourceType: source_type || undefined,
        sourceId: source_id || undefined,
        periodId: period_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, entries.map(mapJournalEntry), "Journal entries fetched successfully"));
});

export const getJournalEntry = asyncHandler(async (req, res) => {
    const entry = await journalEntryService.getJournalEntryById({ accountId: req.user.prismaId, id: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapJournalEntry(entry), "Journal entry fetched successfully"));
});

export const getAccountLedger = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const ledger = await journalEntryService.getAccountLedger({
        accountId: req.user.prismaId,
        chartAccountId: req.params.id,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
    });
    return res.status(200).json(new ApiResponse(200, {
        account: mapChartAccount({ id: ledger.account.id, code: ledger.account.code, name: ledger.account.name, accountType: ledger.account.account_type }),
        opening_balance: ledger.opening_balance,
        closing_balance: ledger.closing_balance,
        movements: ledger.movements.map((m) => ({
            entry_id: m.entry_id,
            date: m.date,
            description: m.description,
            source_type: m.source_type,
            debit: m.debit,
            credit: m.credit,
            running_balance: m.running_balance,
        })),
    }, "Account ledger fetched successfully"));
});

export const listAccountingPeriods = asyncHandler(async (req, res) => {
    const periods = await accountingPeriodService.listAccountingPeriods(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, periods.map(mapPeriod), "Accounting periods fetched successfully"));
});

export const getIncomeStatement = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const statement = await financialStatementsService.getIncomeStatement({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
    });
    return res.status(200).json(new ApiResponse(200, statement, "Income statement fetched successfully"));
});

export const getBalanceSheet = asyncHandler(async (req, res) => {
    const { as_of } = req.query;
    const statement = await financialStatementsService.getBalanceSheet({
        accountId: req.user.prismaId,
        asOfDate: as_of ? endOfDay(as_of) : new Date(),
    });
    return res.status(200).json(new ApiResponse(200, statement, "Balance sheet fetched successfully"));
});

export const getTrialBalance = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const rows = await financialStatementsService.getTrialBalance({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
    });
    return res.status(200).json(new ApiResponse(200, rows, "Trial balance fetched successfully"));
});

export const getAccountingStatus = asyncHandler(async (req, res) => {
    const accountId = req.user.prismaId;
    const [hasJournalEntries, hasBackfilledEntries] = await Promise.all([
        journalEntryService.hasAnyJournalEntry({ accountId }),
        journalEntryService.hasBackfilledJournalEntry({ accountId }),
    ]);
    return res.status(200).json(new ApiResponse(200, {
        has_journal_entries: hasJournalEntries,
        has_backfilled_entries: hasBackfilledEntries,
    }, "Accounting status fetched successfully"));
});

export const closeAccountingPeriod = asyncHandler(async (req, res, next) => {
    if (!req.params.id) return next(new ApiError(400, "id es obligatorio"));

    const period = await accountingPeriodService.closeAccountingPeriod({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        periodId: req.params.id,
    });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Accounting period closed successfully"));
});
