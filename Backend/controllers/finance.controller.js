import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as cashAccountService from "../services/cashAccount.service.js";
import * as cashMovementService from "../services/cashMovement.service.js";
import * as orderPaymentService from "../services/orderPayment.service.js";
import * as purchasePaymentService from "../services/purchasePayment.service.js";
import * as reconciliationService from "../services/bankReconciliation.service.js";

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
    const { name, account_type, point_of_sale_id, bank_name, account_number } = req.body || {};
    const account = await cashAccountService.createCashAccount({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        name,
        accountType: account_type,
        pointOfSaleId: point_of_sale_id || null,
        bankName: bank_name,
        accountNumber: account_number,
    });
    return res.status(201).json(new ApiResponse(201, mapCashAccount(account), "Cash account created successfully"));
});

export const updateCashAccount = asyncHandler(async (req, res) => {
    const { name, bank_name, account_number } = req.body || {};
    const account = await cashAccountService.updateCashAccount({
        accountId: req.user.prismaId,
        id: req.params.id,
        name,
        bankName: bank_name,
        accountNumber: account_number,
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

// --- Order payments (cartera - cuentas por cobrar) ---

export const listOrderPayments = asyncHandler(async (req, res) => {
    const payments = await orderPaymentService.listOrderPayments(req.params.orderId);
    return res.status(200).json(new ApiResponse(200, payments.map(mapPayment), "Order payments fetched successfully"));
});

export const registerOrderPayment = asyncHandler(async (req, res, next) => {
    const { amount, cash_account_id, method, reference } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id es obligatorio"));

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
    const payments = await purchasePaymentService.listPurchasePayments(req.params.purchaseId);
    return res.status(200).json(new ApiResponse(200, payments.map(mapPayment), "Purchase payments fetched successfully"));
});

export const registerPurchasePayment = asyncHandler(async (req, res, next) => {
    const { amount, cash_account_id, method, reference } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id es obligatorio"));

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

// --- Bank reconciliation ---

export const createStatementEntries = asyncHandler(async (req, res, next) => {
    const { cash_account_id, entries } = req.body || {};
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id es obligatorio"));

    const unmatched = await reconciliationService.createStatementEntries({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        cashAccountId: cash_account_id,
        entries: (entries || []).map((e) => ({ entryDate: e.entry_date, description: e.description, amount: e.amount })),
    });
    return res.status(201).json(new ApiResponse(201, unmatched.map(mapStatementEntry), "Statement entries created successfully"));
});

export const listUnmatchedStatementEntries = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id es obligatorio"));

    const entries = await reconciliationService.listUnmatchedStatementEntries({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
    });
    return res.status(200).json(new ApiResponse(200, entries.map(mapStatementEntry), "Unmatched statement entries fetched successfully"));
});

export const listUnmatchedMovements = asyncHandler(async (req, res, next) => {
    const { cash_account_id } = req.query;
    if (!cash_account_id) return next(new ApiError(400, "cash_account_id es obligatorio"));

    const movements = await reconciliationService.listUnmatchedMovements({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
    });
    return res.status(200).json(new ApiResponse(200, movements.map(mapCashMovement), "Unmatched movements fetched successfully"));
});

export const matchStatementEntry = asyncHandler(async (req, res, next) => {
    const { cash_account_id, entry_id, movement_id } = req.body || {};
    if (!cash_account_id || !entry_id || !movement_id) {
        return next(new ApiError(400, "cash_account_id, entry_id y movement_id son obligatorios"));
    }

    const entry = await reconciliationService.matchEntry({
        accountId: req.user.prismaId,
        cashAccountId: cash_account_id,
        entryId: entry_id,
        movementId: movement_id,
    });
    return res.status(200).json(new ApiResponse(200, mapStatementEntry(entry), "Entry matched successfully"));
});
