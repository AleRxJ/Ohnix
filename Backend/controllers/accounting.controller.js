import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as chartOfAccountsService from "../services/chartOfAccounts.service.js";
import * as journalEntryService from "../services/journalEntry.service.js";
import * as accountingPeriodService from "../services/accountingPeriod.service.js";
import * as fiscalYearService from "../services/fiscalYear.service.js";
import * as financialStatementNoteService from "../services/financialStatementNote.service.js";
import * as financialStatementsService from "../services/financialStatements.service.js";
import * as manualVoucherService from "../services/manualJournalVoucher.service.js";
import * as thirdPartyLedgerService from "../services/thirdPartyLedger.service.js";
import * as withholdingConceptService from "../services/withholdingConcept.service.js";
import * as withholdingReportService from "../services/withholdingReport.service.js";
import * as accountingBudgetService from "../services/accountingBudget.service.js";
import * as costCenterService from "../services/costCenter.service.js";
import * as recurringExpenseService from "../services/recurringExpense.service.js";
import * as fixedAssetService from "../services/fixedAsset.service.js";
import * as recurringJournalService from "../services/recurringJournal.service.js";
import * as openingBalanceService from "../services/openingBalance.service.js";
import * as accountingAuditService from "../services/accountingAudit.service.js";
import * as journalReversalService from "../services/journalReversal.service.js";

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
        third_party: l.thirdPartyType ? {
            type: l.thirdPartyType,
            _id: l.thirdPartyId,
            name: l.thirdPartyName,
            document: l.thirdPartyDocument,
        } : null,
        cost_center: l.costCenter ? { _id: l.costCenter.id, code: l.costCenter.code, name: l.costCenter.name } : null,
    })),
});

const mapPeriod = (p) => ({
    _id: p.id,
    year: p.year,
    month: p.month,
    status: p.status,
    closed_at: p.closedAt,
    reopened_until: p.reopenedUntil,
    reopenings: (p.reopenings || []).map((reopening) => ({
        _id: reopening.id,
        reason: reopening.reason,
        reopened_at: reopening.reopenedAt,
        expires_at: reopening.expiresAt,
        reclosed_at: reopening.reclosedAt,
    })),
});

const mapFinancialStatementNote = (note) => ({
    _id: note.id,
    year: note.year,
    title: note.title,
    content: note.content,
    position: note.position,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
});

const mapFiscalYearClosure = (c) => c && ({
    _id: c.id,
    year: c.year,
    status: c.status,
    closed_at: c.closedAt,
    reopened_until: c.reopenedUntil,
    reopenings: (c.reopenings || []).map((reopening) => ({
        _id: reopening.id,
        reason: reopening.reason,
        reopened_at: reopening.reopenedAt,
        expires_at: reopening.expiresAt,
        reclosed_at: reopening.reclosedAt,
    })),
});

const mapManualVoucher = (voucher) => ({
    _id: voucher.id,
    status: voucher.status,
    entry_date: voucher.entryDate,
    description: voucher.description,
    support_url: voucher.supportUrl,
    posted_entry_id: voucher.postedEntryId,
    reversal_entry_id: voucher.reversalEntryId,
    posted_at: voucher.postedAt,
    voided_at: voucher.voidedAt,
    void_reason: voucher.voidReason,
    created_at: voucher.createdAt,
    updated_at: voucher.updatedAt,
    lines: voucher.lines.map((line) => ({
        _id: line.id,
        chart_account: {
            _id: line.chartAccount.id,
            code: line.chartAccount.code,
            name: line.chartAccount.name,
        },
        debit: Number(line.debit),
        credit: Number(line.credit),
        description: line.description,
        position: line.position,
        third_party: line.thirdPartyType ? {
            type: line.thirdPartyType,
            id: line.thirdPartyId,
            name: line.thirdPartyName,
            document: line.thirdPartyDocument,
        } : null,
        cost_center: line.costCenter ? { _id: line.costCenter.id, code: line.costCenter.code, name: line.costCenter.name } : null,
    })),
});

const voucherPayload = (body = {}) => ({
    entryDate: body.entry_date,
    description: body.description,
    supportUrl: body.support_url,
    lines: body.lines,
});

export const createManualVoucher = asyncHandler(async (req, res) => {
    const voucher = await manualVoucherService.createDraft({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        ...voucherPayload(req.body),
    });
    return res.status(201).json(new ApiResponse(201, mapManualVoucher(voucher), "Comprobante creado como borrador."));
});

export const updateManualVoucher = asyncHandler(async (req, res) => {
    const voucher = await manualVoucherService.updateDraft({
        accountId: req.user.prismaId,
        id: req.params.id,
        ...voucherPayload(req.body),
    });
    return res.status(200).json(new ApiResponse(200, mapManualVoucher(voucher), "Borrador actualizado."));
});

export const listManualVouchers = asyncHandler(async (req, res) => {
    const vouchers = await manualVoucherService.listVouchers({
        accountId: req.user.prismaId,
        status: req.query.status || undefined,
    });
    return res.status(200).json(new ApiResponse(200, vouchers.map(mapManualVoucher), "Comprobantes obtenidos."));
});

export const getManualVoucher = asyncHandler(async (req, res) => {
    const voucher = await manualVoucherService.getVoucher({ accountId: req.user.prismaId, id: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapManualVoucher(voucher), "Comprobante obtenido."));
});

export const postManualVoucher = asyncHandler(async (req, res) => {
    const voucher = await manualVoucherService.postDraft({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        id: req.params.id,
    });
    return res.status(200).json(new ApiResponse(200, mapManualVoucher(voucher), "Comprobante contabilizado."));
});

export const voidManualVoucher = asyncHandler(async (req, res) => {
    const voucher = await manualVoucherService.voidPosted({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        id: req.params.id,
        reason: req.body?.reason,
        entryDate: req.body?.entry_date || new Date(),
    });
    return res.status(200).json(new ApiResponse(200, mapManualVoucher(voucher), "Comprobante anulado mediante contraasiento."));
});

export const listThirdPartyBalances = asyncHandler(async (req, res) => {
    const rows = await thirdPartyLedgerService.listThirdPartyBalances({
        accountId: req.user.prismaId,
        startDate: req.query.from ? new Date(req.query.from) : undefined,
        endDate: endOfDay(req.query.to),
        type: req.query.type || undefined,
    });
    return res.status(200).json(new ApiResponse(200, rows, "Auxiliares por tercero obtenidos."));
});

export const getThirdPartyMovements = asyncHandler(async (req, res) => {
    const result = await thirdPartyLedgerService.getThirdPartyMovements({
        accountId: req.user.prismaId,
        type: req.params.type,
        id: req.params.id,
        startDate: req.query.from ? new Date(req.query.from) : undefined,
        endDate: endOfDay(req.query.to),
    });
    return res.status(200).json(new ApiResponse(200, result, "Movimientos del tercero obtenidos."));
});

export const listChartOfAccounts = asyncHandler(async (req, res) => {
    const accounts = await chartOfAccountsService.listChartAccounts(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, accounts.map(mapChartAccount), "Chart of accounts fetched successfully"));
});

export const createChartOfAccount = asyncHandler(async (req, res) => {
    const { code, name, account_type, parent_id } = req.body || {};
    const account = await chartOfAccountsService.createChartAccount(req.user.prismaId, req.user.actorId, {
        code,
        name,
        accountType: account_type,
        parentId: parent_id || undefined,
    });
    return res.status(201).json(new ApiResponse(201, mapChartAccount(account), "Chart account created successfully"));
});

export const setChartOfAccountActive = asyncHandler(async (req, res, next) => {
    const { is_active } = req.body || {};
    if (typeof is_active !== "boolean") return next(new ApiError(400, "is_active must be a boolean.", [], "", "chart_account_active_invalid"));

    const account = await chartOfAccountsService.setChartAccountActive(req.user.prismaId, req.user.actorId, req.params.id, is_active);
    return res.status(200).json(new ApiResponse(200, mapChartAccount(account), "Chart account updated successfully"));
});

export const listJournalEntries = asyncHandler(async (req, res) => {
    const { from, to, source_type, source_id, period_id, cost_center_id } = req.query;
    const entries = await journalEntryService.listJournalEntries({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
        sourceType: source_type || undefined,
        sourceId: source_id || undefined,
        periodId: period_id || undefined,
        costCenterId: cost_center_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, entries.map(mapJournalEntry), "Journal entries fetched successfully"));
});

const mapCostCenter = (center) => ({
    _id: center.id,
    code: center.code,
    name: center.name,
    is_active: center.isActive,
    created_at: center.createdAt,
    updated_at: center.updatedAt,
});

export const listCostCenters = asyncHandler(async (req, res) => {
    const centers = await costCenterService.listCostCenters(req.user.prismaId, { includeInactive: req.query.include_inactive === "true" });
    return res.status(200).json(new ApiResponse(200, centers.map(mapCostCenter), "Centros de costo obtenidos."));
});

export const createCostCenter = asyncHandler(async (req, res) => {
    const center = await costCenterService.createCostCenter(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, mapCostCenter(center), "Centro de costo creado."));
});

export const updateCostCenter = asyncHandler(async (req, res) => {
    const center = await costCenterService.updateCostCenter(req.user.prismaId, req.user.actorId, req.params.id, req.body || {});
    return res.status(200).json(new ApiResponse(200, mapCostCenter(center), "Centro de costo actualizado."));
});

export const getCostCenterLedger = asyncHandler(async (req, res) => {
    const result = await costCenterService.getCostCenterLedger(req.user.prismaId, req.params.id, {
        startDate: req.query.from ? new Date(req.query.from) : undefined,
        endDate: endOfDay(req.query.to),
    });
    return res.status(200).json(new ApiResponse(200, {
        cost_center: mapCostCenter(result.center),
        total_debit: result.total_debit,
        total_credit: result.total_credit,
        movements: result.movements,
    }, "Auxiliar del centro de costo obtenido."));
});

export const assignLocationCostCenter = asyncHandler(async (req, res) => {
    const location = await costCenterService.assignLocationCostCenter(
        req.user.prismaId,
        req.user.actorId,
        req.params.pointOfSaleId,
        req.body?.cost_center_id || null
    );
    return res.status(200).json(new ApiResponse(200, {
        point_of_sale_id: location.id,
        cost_center_id: location.defaultCostCenterId,
    }, "Centro de costo predeterminado actualizado."));
});

export const listRecurringExpenseTemplates = asyncHandler(async (req, res) => {
    const templates = await recurringExpenseService.listRecurringExpenseTemplates(req.user.prismaId, { includeInactive: req.query.include_inactive === "true" });
    return res.status(200).json(new ApiResponse(200, templates, "Gastos recurrentes obtenidos."));
});

export const createRecurringExpenseTemplate = asyncHandler(async (req, res) => {
    const template = await recurringExpenseService.createRecurringExpenseTemplate(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, template, "Gasto recurrente creado."));
});

export const updateRecurringExpenseTemplate = asyncHandler(async (req, res) => {
    const template = await recurringExpenseService.updateRecurringExpenseTemplate(req.user.prismaId, req.user.actorId, req.params.id, req.body || {});
    return res.status(200).json(new ApiResponse(200, template, "Gasto recurrente actualizado."));
});

export const runRecurringExpenseTemplateNow = asyncHandler(async (req, res) => {
    const entry = await recurringExpenseService.runRecurringExpenseTemplateNow(req.user.prismaId, req.user.actorId, req.params.id);
    return res.status(201).json(new ApiResponse(201, { entry_id: entry.id }, "Gasto recurrente generado."));
});

export const listFixedAssets = asyncHandler(async (req, res) => {
    const assets = await fixedAssetService.listFixedAssets(req.user.prismaId, { includeInactive: req.query.include_inactive === "true" });
    return res.status(200).json(new ApiResponse(200, assets, "Activos fijos obtenidos."));
});

export const createFixedAsset = asyncHandler(async (req, res) => {
    const asset = await fixedAssetService.createFixedAsset(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, asset, "Activo fijo creado."));
});

export const updateFixedAsset = asyncHandler(async (req, res) => {
    const asset = await fixedAssetService.updateFixedAsset(req.user.prismaId, req.user.actorId, req.params.id, req.body || {});
    return res.status(200).json(new ApiResponse(200, asset, "Activo fijo actualizado."));
});

export const disposeFixedAsset = asyncHandler(async (req, res) => {
    const asset = await fixedAssetService.disposeFixedAsset(req.user.prismaId, req.user.actorId, req.params.id, {
        reason: req.body?.reason,
        disposalAmount: req.body?.disposal_amount,
        cashAccountId: req.body?.cash_account_id,
    });
    return res.status(200).json(new ApiResponse(200, asset, "Activo fijo dado de baja."));
});

export const runFixedAssetDepreciationNow = asyncHandler(async (req, res) => {
    const entry = await fixedAssetService.runFixedAssetDepreciationNow(req.user.prismaId, req.user.actorId, req.params.id);
    return res.status(201).json(new ApiResponse(201, { entry_id: entry.id }, "Depreciación generada."));
});

export const listRecurringJournalTemplates = asyncHandler(async (req, res) => {
    const templates = await recurringJournalService.listRecurringJournalTemplates(req.user.prismaId, { includeInactive: req.query.include_inactive === "true" });
    return res.status(200).json(new ApiResponse(200, templates, "Plantillas de asiento recurrente obtenidas."));
});

export const createRecurringJournalTemplate = asyncHandler(async (req, res) => {
    const template = await recurringJournalService.createRecurringJournalTemplate(req.user.prismaId, req.body || {});
    return res.status(201).json(new ApiResponse(201, template, "Plantilla de asiento recurrente creada."));
});

export const updateRecurringJournalTemplate = asyncHandler(async (req, res) => {
    const template = await recurringJournalService.updateRecurringJournalTemplate(req.user.prismaId, req.params.id, req.body || {});
    return res.status(200).json(new ApiResponse(200, template, "Plantilla de asiento recurrente actualizada."));
});

export const runRecurringJournalTemplateNow = asyncHandler(async (req, res) => {
    const entry = await recurringJournalService.runRecurringJournalTemplateNow(req.user.prismaId, req.user.actorId, req.params.id);
    return res.status(201).json(new ApiResponse(201, { entry_id: entry.id }, "Asiento recurrente generado."));
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
        costCenterId: req.query.cost_center_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, statement, "Income statement fetched successfully"));
});

export const getIncomeStatementComparison = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const comparison = await financialStatementsService.getIncomeStatementComparison({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
    });
    return res.status(200).json(new ApiResponse(200, comparison, "Estado de resultados comparativo obtenido."));
});

export const getCashFlowStatement = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const statement = await financialStatementsService.getCashFlowStatement({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
    });
    return res.status(200).json(new ApiResponse(200, statement, "Cash flow statement fetched successfully"));
});

export const getBalanceSheet = asyncHandler(async (req, res) => {
    const { as_of } = req.query;
    const statement = await financialStatementsService.getBalanceSheet({
        accountId: req.user.prismaId,
        asOfDate: as_of ? endOfDay(as_of) : new Date(),
        costCenterId: req.query.cost_center_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, statement, "Balance sheet fetched successfully"));
});

export const getTrialBalance = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const rows = await financialStatementsService.getTrialBalance({
        accountId: req.user.prismaId,
        startDate: from ? new Date(from) : undefined,
        endDate: endOfDay(to),
        costCenterId: req.query.cost_center_id || undefined,
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

export const createOpeningBalance = asyncHandler(async (req, res) => {
    const entry = await openingBalanceService.createOpeningBalance({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        entryDate: req.body?.entry_date,
        description: req.body?.description,
        lines: req.body?.lines,
    });
    return res.status(201).json(new ApiResponse(201, {
        _id: entry.id,
        entry_date: entry.entryDate,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
    }, "Opening balance posted successfully"));
});

export const listAccountingAudit = asyncHandler(async (req, res) => {
    const rows = await accountingAuditService.listAccountingAudit({
        accountId: req.user.prismaId,
        from: req.query.from,
        to: req.query.to,
        entityType: req.query.entity_type,
        action: req.query.action,
        actorId: req.query.actor_id,
    });
    return res.status(200).json(new ApiResponse(200, rows, "Accounting audit fetched successfully."));
});

export const reverseJournalEntry = asyncHandler(async (req, res) => {
    const result = await journalReversalService.reverseJournalEntry({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, reason: req.body?.reason, entryDate: req.body?.entry_date || new Date() });
    return res.status(201).json(new ApiResponse(201, result, "Journal entry reversed successfully."));
});

export const getBudgetReport = asyncHandler(async (req, res) => {
    const report = await accountingBudgetService.getBudgetReport({
        accountId: req.user.prismaId,
        year: req.query.year,
        month: req.query.month,
        costCenterId: req.query.cost_center_id || "all",
    });
    return res.status(200).json(new ApiResponse(200, report, "Budget performance fetched successfully."));
});

export const saveBudgets = asyncHandler(async (req, res) => {
    const budgets = await accountingBudgetService.saveBudgets({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        year: req.body?.year,
        month: req.body?.month,
        items: req.body?.items,
    });
    return res.status(200).json(new ApiResponse(200, { saved: budgets.length }, "Budget saved successfully."));
});

export const deleteBudget = asyncHandler(async (req, res) => {
    await accountingBudgetService.deleteBudget({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id });
    return res.status(200).json(new ApiResponse(200, null, "Budget line deleted successfully."));
});

export const getAnnualBudgetReport = asyncHandler(async (req, res) => {
    const report = await accountingBudgetService.getAnnualBudgetReport({ accountId: req.user.prismaId, year: req.query.year, costCenterId: req.query.cost_center_id || "all" });
    return res.status(200).json(new ApiResponse(200, report, "Annual budget fetched successfully."));
});

export const distributeAnnualBudget = asyncHandler(async (req, res) => {
    const result = await accountingBudgetService.distributeAnnualBudget({ accountId: req.user.prismaId, actorId: req.user.actorId, year: req.body?.year, chartAccountId: req.body?.chart_account_id, costCenterId: req.body?.cost_center_id, annualAmount: req.body?.annual_amount, alertThresholdPercent: req.body?.alert_threshold_percent });
    return res.status(200).json(new ApiResponse(200, result, "Annual budget distributed successfully."));
});

export const copyAnnualBudget = asyncHandler(async (req, res) => {
    const result = await accountingBudgetService.copyAnnualBudget({ accountId: req.user.prismaId, actorId: req.user.actorId, sourceYear: req.body?.source_year, targetYear: req.body?.target_year, costCenterId: req.body?.cost_center_id || "all", overwrite: req.body?.overwrite === true });
    return res.status(200).json(new ApiResponse(200, result, "Annual budget copied successfully."));
});

export const closeAccountingPeriod = asyncHandler(async (req, res, next) => {
    if (!req.params.id) return next(new ApiError(400, "Accounting period id is required.", [], "", "accounting_period_id_required"));

    const period = await accountingPeriodService.closeAccountingPeriod({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        periodId: req.params.id,
    });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Accounting period closed successfully"));
});

export const getAccountingPeriodCloseReadiness = asyncHandler(async (req, res) => {
    const result = await accountingPeriodService.getAccountingPeriodCloseReadiness({ accountId: req.user.prismaId, periodId: req.params.id });
    return res.status(200).json(new ApiResponse(200, result, "Accounting period close readiness fetched successfully"));
});

export const reopenAccountingPeriod = asyncHandler(async (req, res) => {
    const period = await accountingPeriodService.reopenAccountingPeriod({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        periodId: req.params.id,
        reason: req.body?.reason,
        durationHours: req.body?.duration_hours ?? 24,
    });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Accounting period reopened successfully."));
});

export const listFiscalYearClosures = asyncHandler(async (req, res) => {
    const closures = await fiscalYearService.listFiscalYearClosures(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, closures.map(mapFiscalYearClosure), "Fiscal year closures fetched successfully"));
});

export const getFiscalYearCloseReadiness = asyncHandler(async (req, res, next) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year)) return next(new ApiError(400, "A valid fiscal year is required.", [], "", "fiscal_year_invalid"));

    const result = await fiscalYearService.getFiscalYearCloseReadiness({ accountId: req.user.prismaId, year });
    return res.status(200).json(new ApiResponse(200, { ...result, closure: mapFiscalYearClosure(result.closure) }, "Fiscal year close readiness fetched successfully"));
});

export const closeFiscalYear = asyncHandler(async (req, res, next) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year)) return next(new ApiError(400, "A valid fiscal year is required.", [], "", "fiscal_year_invalid"));

    const closure = await fiscalYearService.closeFiscalYear({ accountId: req.user.prismaId, actorId: req.user.actorId, year });
    return res.status(200).json(new ApiResponse(200, mapFiscalYearClosure(closure), "Fiscal year closed successfully"));
});

export const reopenFiscalYear = asyncHandler(async (req, res, next) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year)) return next(new ApiError(400, "A valid fiscal year is required.", [], "", "fiscal_year_invalid"));

    const closure = await fiscalYearService.reopenFiscalYear({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        year,
        reason: req.body?.reason,
        durationHours: req.body?.duration_hours ?? 24,
    });
    return res.status(200).json(new ApiResponse(200, mapFiscalYearClosure(closure), "Fiscal year reopened successfully."));
});

export const listFinancialStatementNotes = asyncHandler(async (req, res, next) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year)) return next(new ApiError(400, "A valid year is required.", [], "", "financial_statement_note_invalid_year"));

    const notes = await financialStatementNoteService.listFinancialStatementNotes(req.user.prismaId, year);
    return res.status(200).json(new ApiResponse(200, notes.map(mapFinancialStatementNote), "Financial statement notes fetched successfully"));
});

export const createFinancialStatementNote = asyncHandler(async (req, res) => {
    const note = await financialStatementNoteService.createFinancialStatementNote({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        year: req.body?.year,
        title: req.body?.title,
        content: req.body?.content,
    });
    return res.status(201).json(new ApiResponse(201, mapFinancialStatementNote(note), "Financial statement note created successfully"));
});

export const updateFinancialStatementNote = asyncHandler(async (req, res) => {
    const note = await financialStatementNoteService.updateFinancialStatementNote({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        id: req.params.id,
        title: req.body?.title,
        content: req.body?.content,
    });
    return res.status(200).json(new ApiResponse(200, mapFinancialStatementNote(note), "Financial statement note updated successfully"));
});

export const deleteFinancialStatementNote = asyncHandler(async (req, res) => {
    await financialStatementNoteService.deleteFinancialStatementNote({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        id: req.params.id,
    });
    return res.status(200).json(new ApiResponse(200, null, "Financial statement note deleted successfully"));
});

export const listWithholdingConcepts = asyncHandler(async (req, res) => {
    const concepts = await withholdingConceptService.listWithholdingConcepts(req.user.prismaId, {
        activeAt: req.query.active_at,
    });
    return res.status(200).json(new ApiResponse(200, concepts, "Withholding concepts fetched successfully."));
});

export const createWithholdingConcept = asyncHandler(async (req, res) => {
    const concept = await withholdingConceptService.createWithholdingConcept(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, concept, "Withholding concept created successfully."));
});

export const setWithholdingConceptActive = asyncHandler(async (req, res) => {
    const concept = await withholdingConceptService.setWithholdingConceptActive(
        req.user.prismaId,
        req.user.actorId,
        req.params.id,
        req.body?.is_active
    );
    return res.status(200).json(new ApiResponse(200, concept, "Withholding concept status updated successfully."));
});

export const previewWithholdings = asyncHandler(async (req, res) => {
    const preview = await withholdingConceptService.previewWithholdings(req.user.prismaId, req.body || {});
    return res.status(200).json(new ApiResponse(200, preview, "Withholdings calculated successfully."));
});

export const getWithholdingReport = asyncHandler(async (req, res) => {
    const report = await withholdingReportService.getWithholdingReport({
        accountId: req.user.prismaId,
        from: req.query.from ? new Date(req.query.from) : undefined,
        to: endOfDay(req.query.to),
        taxType: req.query.tax_type,
        supplierId: req.query.supplier_id,
    });
    return res.status(200).json(new ApiResponse(200, report, "Withholding report fetched successfully."));
});

export const getWithholdingCertificate = asyncHandler(async (req, res) => {
    const certificate = await withholdingReportService.getWithholdingCertificate({
        accountId: req.user.prismaId,
        supplierId: req.params.supplierId,
        year: req.query.year,
    });
    return res.status(200).json(new ApiResponse(200, certificate, "Withholding certificate fetched successfully."));
});

export const downloadWithholdingCertificate = asyncHandler(async (req, res) => {
    const certificate = await withholdingReportService.getWithholdingCertificate({ accountId: req.user.prismaId, supplierId: req.params.supplierId, year: req.query.year });
    withholdingReportService.renderWithholdingCertificatePdf(res, certificate, req.query.language);
});
