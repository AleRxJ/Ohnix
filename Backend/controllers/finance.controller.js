import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as cashAccountService from "../services/cashAccount.service.js";
import * as cashMovementService from "../services/cashMovement.service.js";
import * as orderPaymentService from "../services/orderPayment.service.js";
import * as purchasePaymentService from "../services/purchasePayment.service.js";
import * as reconciliationService from "../services/bankReconciliation.service.js";
import * as manualExpenseService from "../services/manualExpense.service.js";
import * as manualIncomeService from "../services/manualIncome.service.js";
import * as cashTransferService from "../services/cashTransfer.service.js";
import * as cashAdjustmentService from "../services/cashAdjustment.service.js";
import * as cashIntegrityService from "../services/cashIntegrity.service.js";
import * as accountsPayableService from "../services/accountsPayable.service.js";
import * as accountsReceivableService from "../services/accountsReceivable.service.js";

const scope = (req) => ({
    accountId: req.user.prismaId,
    posScopeAll: req.user.role === "admin" ? true : req.user.posScopeAll,
    posScopeIds: req.user.posScopeIds,
});

const mapCashAccount = (a) => ({
    _id: a.id,
    name: a.name,
    account_type: a.accountType,
    point_of_sale: a.pointOfSale ? { _id: a.pointOfSale.id, name: a.pointOfSale.name } : { _id: a.pointOfSaleId },
    bank_name: a.bankName,
    account_number: a.accountNumber,
    chart_account: a.chartAccount ? { _id: a.chartAccount.id, code: a.chartAccount.code, name: a.chartAccount.name, account_type: a.chartAccount.accountType } : null,
    balance: Number(a.balance),
    is_active: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
});

const mapCashMovement = (m) => ({
    _id: m.id,
    cash_account_id: m.cashAccountId,
    delta: Number(m.delta),
    balance_after: Number(m.balanceAfter),
    source_type: m.sourceType,
    source_id: m.sourceId,
    reason: m.reason,
    reconciled_at: m.reconciledAt,
    created_by: m.createdBy ? { _id: m.createdBy.id, username: m.createdBy.username } : { _id: m.createdById },
    createdAt: m.createdAt,
});

const mapPayment = (p) => ({
    _id: p.id,
    amount: Number(p.amount),
    cash_account: p.cashAccount ? { _id: p.cashAccount.id, name: p.cashAccount.name } : { _id: p.cashAccountId },
    method: p.method,
    reference: p.reference,
    paid_at: p.paidAt,
    created_by: p.createdBy ? { _id: p.createdBy.id, username: p.createdBy.username } : { _id: p.createdById },
});

const mapStatementEntry = (e) => ({
    _id: e.id,
    cash_account_id: e.cashAccountId,
    entry_date: e.entryDate,
    description: e.description,
    amount: Number(e.amount),
    matched_movement_id: e.matchedMovementId,
});

// --- Cash accounts ---

export const listCashAccounts = asyncHandler(async (req, res) => {
    const accounts = await cashAccountService.listCashAccounts({
        ...scope(req),
        includeInactive: req.query.include_inactive === "true",
    });
    return res.status(200).json(new ApiResponse(200, accounts.map(mapCashAccount), "Cash accounts fetched successfully"));
});

export const getCashAccount = asyncHandler(async (req, res) => {
    const account = await cashAccountService.getCashAccountById({ ...scope(req), id: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapCashAccount(account), "Cash account fetched successfully"));
});

export const createCashAccount = asyncHandler(async (req, res) => {
    const { name, account_type, point_of_sale_id, bank_name, account_number, chart_account_id } = req.body || {};
    const account = await cashAccountService.createCashAccount({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        name,
        accountType: account_type,
        pointOfSaleId: point_of_sale_id || null,
        bankName: bank_name,
        accountNumber: account_number,
        chartAccountId: chart_account_id || null,
    });
    return res.status(201).json(new ApiResponse(201, mapCashAccount(account), "Cash account created successfully"));
});

export const updateCashAccount = asyncHandler(async (req, res) => {
    const { name, bank_name, account_number, chart_account_id } = req.body || {};
    const account = await cashAccountService.updateCashAccount({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        id: req.params.id,
        name,
        bankName: bank_name,
        accountNumber: account_number,
        chartAccountId: chart_account_id,
    });
    return res.status(200).json(new ApiResponse(200, mapCashAccount(account), "Cash account updated successfully"));
});

export const deactivateCashAccount = asyncHandler(async (req, res) => {
    const account = await cashAccountService.deactivateCashAccount({ accountId: req.user.prismaId, id: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapCashAccount(account), "Cash account deactivated successfully"));
});

export const listCashAccountMovements = asyncHandler(async (req, res) => {
    await cashAccountService.getCashAccountById({ ...scope(req), id: req.params.id });
    const movements = await cashMovementService.listCashMovements({ cashAccountId: req.params.id });
    return res.status(200).json(new ApiResponse(200, movements.map(mapCashMovement), "Cash movements fetched successfully"));
});

export const registerManualExpense = asyncHandler(async (req, res, next) => {
    const { amount, expense_account_id, cash_account_id, description, expense_date, statement_entry_id, tax_treatment, tax_rate } = req.body || {};
    if (!expense_account_id || !cash_account_id) {
        return next(new ApiError(400, "expense_account_id and cash_account_id are required.", [], "", "finance_expense_accounts_required"));
    }

    const result = await manualExpenseService.registerManualExpense({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        amount,
        expenseAccountId: expense_account_id,
        cashAccountId: cash_account_id,
        description,
        expenseDate: expense_date,
        statementEntryId: statement_entry_id || null,
        taxTreatment: tax_treatment || "excluded",
        taxRate: tax_rate || 0,
    });
    return res.status(201).json(new ApiResponse(201, {
        journal_entry_id: result.entry.id,
        cash_movement_id: result.movement.id,
        balance_after: Number(result.movement.balanceAfter),
    }, "Manual expense registered successfully"));
});

// --- Order payments (cartera - cuentas por cobrar) ---

export const listOrderPayments = asyncHandler(async (req, res) => {
    const payments = await orderPaymentService.listOrderPayments({ accountId: req.user.prismaId, orderId: req.params.orderId });
    return res.status(200).json(new ApiResponse(200, payments.map(mapPayment), "Order payments fetched successfully"));
});

export const registerOrderPayment = asyncHandler(async (req, res, next) => {
    const { amount, cash_account_id, method, reference } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));

    const payment = await orderPaymentService.registerOrderPayment({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        orderId: req.params.orderId,
        amount,
        cashAccountId: cash_account_id,
        method,
        reference,
    });
    return res.status(201).json(new ApiResponse(201, mapPayment(payment), "Order payment registered successfully"));
});

// --- Purchase payments (cartera - cuentas por pagar) ---

export const listPurchasePayments = asyncHandler(async (req, res) => {
    const payments = await purchasePaymentService.listPurchasePayments({ accountId: req.user.prismaId, purchaseId: req.params.purchaseId });
    return res.status(200).json(new ApiResponse(200, payments.map(mapPayment), "Purchase payments fetched successfully"));
});

export const registerPurchasePayment = asyncHandler(async (req, res, next) => {
    const { amount, cash_account_id, method, reference } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));

    const payment = await purchasePaymentService.registerPurchasePayment({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        purchaseId: req.params.purchaseId,
        amount,
        cashAccountId: cash_account_id,
        method,
        reference,
    });
    return res.status(201).json(new ApiResponse(201, mapPayment(payment), "Purchase payment registered successfully"));
});

export const getAccountsPayablePlan = asyncHandler(async (req, res) => {
    const plan = await accountsPayableService.getAccountsPayablePlan(scope(req));
    return res.status(200).json(new ApiResponse(200, plan, "Plan de cuentas por pagar consultado."));
});

export const updatePurchaseDueDate = asyncHandler(async (req, res) => {
    const purchase = await accountsPayableService.updatePurchaseDueDate({ accountId: req.user.prismaId, purchaseId: req.params.purchaseId, dueDate: req.body?.due_date || null });
    return res.status(200).json(new ApiResponse(200, { _id: purchase.id, due_date: purchase.dueDate }, "Vencimiento actualizado."));
});

export const getAccountsReceivablePlan = asyncHandler(async (req, res) => {
    const plan = await accountsReceivableService.getAccountsReceivablePlan(scope(req));
    return res.status(200).json(new ApiResponse(200, plan, "Plan de cuentas por cobrar consultado."));
});

export const updateOrderDueDate = asyncHandler(async (req, res) => {
    const order = await accountsReceivableService.updateOrderDueDate({ accountId: req.user.prismaId, orderId: req.params.orderId, dueDate: req.body?.due_date || null });
    return res.status(200).json(new ApiResponse(200, { _id: order.id, due_date: order.dueDate }, "Vencimiento actualizado."));
});

// --- Bank reconciliation ---

export const createStatementEntries = asyncHandler(async (req, res, next) => {
    const { cash_account_id, entries } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));

    const result = await reconciliationService.createStatementEntries({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        cashAccountId: cash_account_id,
        entries: (entries || []).map((e) => ({ entryDate: e.entry_date, description: e.description, amount: e.amount, importFingerprint: e.import_fingerprint })),
    });
    return res.status(201).json(new ApiResponse(201, {
        entries: result.unmatched.map(mapStatementEntry),
        imported_count: result.importedCount,
        skipped_count: result.skippedCount,
    }, "Statement entries created successfully"));
});

export const listUnmatchedStatementEntries = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));

    const entries = await reconciliationService.listUnmatchedStatementEntries({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
    });
    return res.status(200).json(new ApiResponse(200, entries.map(mapStatementEntry), "Unmatched statement entries fetched successfully"));
});

export const listUnmatchedMovements = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));

    const movements = await reconciliationService.listUnmatchedMovements({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
    });
    return res.status(200).json(new ApiResponse(200, movements.map(mapCashMovement), "Unmatched movements fetched successfully"));
});

export const matchStatementEntry = asyncHandler(async (req, res, next) => {
    const { cash_account_id, entry_id, movement_id } = req.body || {};
    if (!cash_account_id || !entry_id || !movement_id) {
        return next(new ApiError(400, "cash_account_id, entry_id, and movement_id are required.", [], "", "reconciliation_match_fields_required"));
    }

    const entry = await reconciliationService.matchEntry({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
        entryId: entry_id,
        movementId: movement_id,
    });
    return res.status(200).json(new ApiResponse(200, mapStatementEntry(entry), "Entry matched successfully"));
});

export const listCashAccountConfigurationHistory = asyncHandler(async (req, res) => {
    const rows = await cashAccountService.listCashAccountConfigurationHistory({ accountId: req.user.prismaId, id: req.params.id });
    return res.status(200).json(new ApiResponse(200, rows.map((row) => ({ _id: row.id, action: row.action, before: row.before, after: row.after, actor: { _id: row.actor.id, name: row.actor.username || row.actor.email }, created_at: row.createdAt })), "Cash account configuration history fetched successfully"));
});

export const registerManualIncome = asyncHandler(async (req, res, next) => {
    const { amount, revenue_account_id, cash_account_id, description, income_date, statement_entry_id, tax_treatment, tax_rate } = req.body || {};
    if (!revenue_account_id || !cash_account_id) return next(new ApiError(400, "revenue_account_id and cash_account_id are required.", [], "", "finance_income_accounts_required"));
    const result = await manualIncomeService.registerManualIncome({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        amount,
        revenueAccountId: revenue_account_id,
        cashAccountId: cash_account_id,
        description,
        incomeDate: income_date,
        statementEntryId: statement_entry_id || null,
        taxTreatment: tax_treatment || "excluded",
        taxRate: tax_rate || 0,
    });
    return res.status(201).json(new ApiResponse(201, {
        journal_entry_id: result.entry.id,
        cash_movement_id: result.movement.id,
        balance_after: Number(result.movement.balanceAfter),
    }, "Manual income registered successfully"));
});

export const transferCash = asyncHandler(async (req, res) => {
    const { from_cash_account_id, to_cash_account_id, amount, description, transfer_date } = req.body || {};
    const result = await cashTransferService.transferCash({ accountId: req.user.prismaId, actorId: req.user.actorId, fromCashAccountId: from_cash_account_id, toCashAccountId: to_cash_account_id, amount, description, transferDate: transfer_date });
    return res.status(201).json(new ApiResponse(201, { transfer_id: result.transferId, journal_entry_id: result.entry?.id, from_balance: Number(result.outMovement.balanceAfter), to_balance: Number(result.inMovement.balanceAfter) }, "Cash transfer registered successfully"));
});

export const adjustCash = asyncHandler(async (req, res) => {
    const { cash_account_id, counterpart_account_id, amount, reason, adjustment_date } = req.body || {};
    const result = await cashAdjustmentService.adjustCash({ accountId: req.user.prismaId, actorId: req.user.actorId, cashAccountId: cash_account_id, counterpartAccountId: counterpart_account_id, amount, reason, adjustmentDate: adjustment_date });
    return res.status(201).json(new ApiResponse(201, { adjustment_id: result.adjustmentId, journal_entry_id: result.entry?.id, cash_movement_id: result.movement.id, balance_after: Number(result.movement.balanceAfter) }, "Cash adjustment registered successfully"));
});

export const getCashIntegrity = asyncHandler(async (req, res) => {
    const result = await cashIntegrityService.getCashIntegrity({ accountId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, result, "Cash integrity fetched successfully"));
});

export const suggestStatementMatches = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));
    const suggestions = await reconciliationService.suggestMatches({ accountId: req.user.prismaId, cashAccountId: cash_account_id });
    return res.status(200).json(new ApiResponse(200, suggestions.map((row) => ({ entry: mapStatementEntry(row.entry), movement: mapCashMovement(row.movement), score: row.score, ambiguous: row.ambiguous })), "Reconciliation suggestions fetched successfully"));
});

export const getReconciliationSummary = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));
    const summary = await reconciliationService.getReconciliationSummary({ accountId: req.user.prismaId, cashAccountId: cash_account_id });
    return res.status(200).json(new ApiResponse(200, summary, "Reconciliation summary fetched successfully"));
});

export const getReconciliationReport = asyncHandler(async (req, res, next) => {
    const { cash_account_id, date_from, date_to, status } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id is required.", [], "", "finance_cash_account_required"));
    const rows = await reconciliationService.getReconciliationReport({ accountId: req.user.prismaId, cashAccountId: cash_account_id, dateFrom: date_from, dateTo: date_to, status });
    return res.status(200).json(new ApiResponse(200, rows.map((row) => ({
        ...mapStatementEntry(row),
        status: row.matchedMovementId ? "matched" : "unmatched",
        movement: row.matchedMovement ? mapCashMovement({ ...row.matchedMovement, cashAccountId: row.cashAccountId, createdById: row.createdById }) : null,
    })), "Reconciliation report fetched successfully"));
});
