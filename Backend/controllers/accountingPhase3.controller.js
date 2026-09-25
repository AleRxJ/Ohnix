import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as impairmentService from "../services/receivableImpairment.service.js";
import * as obligationService from "../services/financialObligation.service.js";
import * as inventoryValuationService from "../services/inventoryValuation.service.js";
import * as icaService from "../services/icaDeclaration.service.js";
import * as writeOffService from "../services/receivableWriteOff.service.js";

// Deterioro de cartera, obligaciones financieras, kardex valorizado and ICA
// - thin HTTP layer over their services, same snake_case response shape as
// the rest of the accounting module.

// --- Deterioro de cartera ---
const mapRun = (row) => ({
    _id: row.id,
    as_of: row.asOfDate,
    rates: row.rates,
    bucket_totals: row.bucketTotals,
    required_provision: Number(row.requiredProvision),
    previous_provision: Number(row.previousProvision),
    adjustment: Number(row.adjustment),
    journal_entry_id: row.journalEntryId,
    created_at: row.createdAt,
});

export const previewImpairment = asyncHandler(async (req, res) => {
    const { as_of, rates } = req.body || {};
    const preview = await impairmentService.previewImpairment({ accountId: req.user.prismaId, asOf: as_of, rates });
    return res.status(200).json(new ApiResponse(200, preview, "Impairment preview fetched successfully"));
});

export const runImpairment = asyncHandler(async (req, res) => {
    const { as_of, rates } = req.body || {};
    const run = await impairmentService.runImpairment({ accountId: req.user.prismaId, actorId: req.user.actorId, asOf: as_of, rates });
    return res.status(201).json(new ApiResponse(201, mapRun(run), "Impairment posted successfully"));
});

export const listImpairmentRuns = asyncHandler(async (req, res) => {
    const rows = await impairmentService.listImpairmentRuns({ accountId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, rows.map(mapRun), "Impairment runs fetched successfully"));
});

// --- Obligaciones financieras ---
export const listFinancialObligations = asyncHandler(async (req, res) => {
    const rows = await obligationService.listFinancialObligations(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, rows, "Financial obligations fetched successfully"));
});

export const previewObligationSchedule = asyncHandler(async (req, res) => {
    const schedule = obligationService.previewSchedule(req.body || {});
    return res.status(200).json(new ApiResponse(200, { installment: schedule.installment, monthly_rate_percent: Math.round(schedule.monthlyRate * 1000000) / 10000, rows: schedule.rows }, "Schedule computed successfully"));
});

export const createFinancialObligation = asyncHandler(async (req, res) => {
    const row = await obligationService.createFinancialObligation(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, row, "Financial obligation created successfully"));
});

export const payObligationInstallment = asyncHandler(async (req, res) => {
    const { cash_account_id, payment_date, interest } = req.body || {};
    const row = await obligationService.payNextInstallment(req.user.prismaId, req.user.actorId, req.params.id, { cashAccountId: cash_account_id, paymentDate: payment_date, interest });
    return res.status(200).json(new ApiResponse(200, row, "Installment paid successfully"));
});

// --- Kardex valorizado ---
export const getInventoryValuation = asyncHandler(async (req, res) => {
    const report = await inventoryValuationService.getInventoryValuation({ accountId: req.user.prismaId, asOf: req.query.as_of });
    return res.status(200).json(new ApiResponse(200, report, "Inventory valuation fetched successfully"));
});

export const getProductKardex = asyncHandler(async (req, res) => {
    const { from, to, point_of_sale_id } = req.query;
    const report = await inventoryValuationService.getProductKardex({ accountId: req.user.prismaId, productId: req.params.productId, from, to, pointOfSaleId: point_of_sale_id || null });
    return res.status(200).json(new ApiResponse(200, report, "Kardex fetched successfully"));
});

// --- ICA ---
const mapIca = (row) => row ? ({
    _id: row.id,
    periodicity: row.periodicity,
    year: row.year,
    period_number: row.periodNumber,
    start_date: row.startDate,
    end_date: row.endDate,
    gross_income: Number(row.grossIncome),
    excluded_income: Number(row.excludedIncome),
    taxable_base: Number(row.taxableBase),
    rate_per_thousand: Number(row.ratePerThousand),
    ica_tax: Number(row.icaTax),
    avisos_tableros: Number(row.avisosTableros),
    bomberil_surcharge: Number(row.bomberilSurcharge),
    withheld_ica_applied: Number(row.withheldIcaApplied),
    net_payable: Number(row.netPayable),
    status: row.status,
    paid_at: row.paidAt,
    voided_at: row.voidedAt,
    void_reason: row.voidReason,
    created_at: row.createdAt,
}) : null;

const icaOptions = (source) => ({
    periodicity: source.periodicity,
    year: source.year,
    periodNumber: source.period_number,
    excludedIncome: source.excluded_income,
    ratePerThousand: source.rate_per_thousand,
    avisosTableros: source.avisos_tableros === true || source.avisos_tableros === "true",
    bomberilPercent: source.bomberil_percent,
});

export const listIcaDeclarations = asyncHandler(async (req, res) => {
    const rows = await icaService.listIcaDeclarations({ accountId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, rows.map(mapIca), "ICA declarations fetched successfully"));
});

export const previewIcaDeclaration = asyncHandler(async (req, res) => {
    const preview = await icaService.previewIcaDeclaration({ accountId: req.user.prismaId, ...icaOptions(req.query) });
    const r = preview.result;
    return res.status(200).json(new ApiResponse(200, {
        start_date: preview.range.startDate,
        end_date: preview.range.endDate,
        blockers: preview.blockers,
        existing: mapIca(preview.existing),
        municipality_code: preview.company?.icaMunicipalityCode || null,
        activity_code: preview.company?.icaActivityCode || null,
        rate_per_thousand: preview.ratePerThousand,
        revenue_lines: preview.revenueLines.map((line) => ({ code: line.code, name: line.name, amount: line.amount })),
        ...(r ? {
            gross_income: r.grossIncome,
            excluded_income: r.excludedIncome,
            taxable_base: r.taxableBase,
            ica_tax: r.icaTax,
            avisos_tableros: r.avisosTableros,
            bomberil_surcharge: r.bomberilSurcharge,
            total: r.total,
            available_withheld: r.availableWithheld,
            withheld_ica_applied: r.withheldIcaApplied,
            net_payable: r.netPayable,
        } : {}),
    }, "ICA preview fetched successfully"));
});

export const settleIcaDeclaration = asyncHandler(async (req, res) => {
    const row = await icaService.settleIcaDeclaration({ accountId: req.user.prismaId, actorId: req.user.actorId, ...icaOptions(req.body || {}) });
    return res.status(201).json(new ApiResponse(201, mapIca(row), "ICA declaration posted successfully"));
});

export const voidIcaDeclaration = asyncHandler(async (req, res) => {
    const row = await icaService.voidIcaDeclaration({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, reason: req.body?.reason });
    return res.status(200).json(new ApiResponse(200, mapIca(row), "ICA declaration voided successfully"));
});

export const payIcaDeclaration = asyncHandler(async (req, res) => {
    const { cash_account_id, payment_date } = req.body || {};
    const row = await icaService.payIcaDeclaration({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, cashAccountId: cash_account_id, paymentDate: payment_date });
    return res.status(200).json(new ApiResponse(200, mapIca(row), "ICA declaration paid successfully"));
});

// --- Castigo de cartera ---
const mapWriteOff = (row) => ({
    _id: row.id,
    order: row.order ? { _id: row.order.id, invoice_no: row.order.invoiceNo, customer: row.order.customer ? { _id: row.order.customer.id, name: row.order.customer.name } : null } : { _id: row.orderId },
    amount: Number(row.amount),
    allowance_used: Number(row.allowanceUsed),
    expense_amount: Number(row.expenseAmount),
    write_off_date: row.writeOffDate,
    reason: row.reason,
    reversed_at: row.reversedAt,
    reversal_reason: row.reversalReason,
    created_at: row.createdAt,
});

export const listWriteOffs = asyncHandler(async (req, res) => {
    const rows = await writeOffService.listWriteOffs({ accountId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, rows.map(mapWriteOff), "Write-offs fetched successfully"));
});

export const writeOffReceivable = asyncHandler(async (req, res) => {
    const { order_id, amount, reason, write_off_date } = req.body || {};
    const row = await writeOffService.writeOffReceivable({ accountId: req.user.prismaId, actorId: req.user.actorId, orderId: order_id, amount, reason, writeOffDate: write_off_date });
    return res.status(201).json(new ApiResponse(201, mapWriteOff(row), "Receivable written off successfully"));
});

export const reverseWriteOff = asyncHandler(async (req, res) => {
    const row = await writeOffService.reverseWriteOff({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, reason: req.body?.reason, reversalDate: req.body?.reversal_date });
    return res.status(200).json(new ApiResponse(200, mapWriteOff(row), "Write-off reversed successfully"));
});

// --- Abono extraordinario ---
export const payObligationExtra = asyncHandler(async (req, res) => {
    const { cash_account_id, payment_date, amount, strategy } = req.body || {};
    const row = await obligationService.payExtraPrincipal(req.user.prismaId, req.user.actorId, req.params.id, { cashAccountId: cash_account_id, paymentDate: payment_date, amount, strategy });
    return res.status(200).json(new ApiResponse(200, row, "Extra payment registered successfully"));
});
