import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as prepaidExpenseService from "../services/prepaidExpense.service.js";

export const listPrepaidExpenses = asyncHandler(async (req, res) => {
    const rows = await prepaidExpenseService.listPrepaidExpenses(req.user.prismaId, { includeInactive: req.query.include_inactive === "true" });
    return res.status(200).json(new ApiResponse(200, rows, "Prepaid expenses fetched successfully"));
});

export const createPrepaidExpense = asyncHandler(async (req, res) => {
    const row = await prepaidExpenseService.createPrepaidExpense(req.user.prismaId, req.user.actorId, req.body || {});
    return res.status(201).json(new ApiResponse(201, row, "Prepaid expense created successfully"));
});

export const updatePrepaidExpense = asyncHandler(async (req, res) => {
    const row = await prepaidExpenseService.updatePrepaidExpense(req.user.prismaId, req.user.actorId, req.params.id, req.body || {});
    return res.status(200).json(new ApiResponse(200, row, "Prepaid expense updated successfully"));
});

export const runPrepaidAmortizationNow = asyncHandler(async (req, res) => {
    const entry = await prepaidExpenseService.runPrepaidAmortizationNow(req.user.prismaId, req.user.actorId, req.params.id);
    return res.status(201).json(new ApiResponse(201, { journal_entry_id: entry?.id || null }, "Amortization posted successfully"));
});

export const cancelPrepaidExpense = asyncHandler(async (req, res) => {
    const row = await prepaidExpenseService.cancelPrepaidExpense(req.user.prismaId, req.user.actorId, req.params.id, { reason: req.body?.reason });
    return res.status(200).json(new ApiResponse(200, row, "Prepaid expense cancelled successfully"));
});
