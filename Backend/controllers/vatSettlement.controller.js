import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as vatSettlementService from "../services/vatSettlement.service.js";

const mapSettlement = (row) => row ? ({
    _id: row.id,
    periodicity: row.periodicity,
    year: row.year,
    period_number: row.periodNumber,
    start_date: row.startDate,
    end_date: row.endDate,
    generated_total: Number(row.generatedTotal),
    deductible_total: Number(row.deductibleTotal),
    carry_forward_applied: Number(row.carryForwardApplied),
    net_payable: Number(row.netPayable),
    credit_balance: Number(row.creditBalance),
    status: row.status,
    settlement_entry_id: row.settlementEntryId,
    payment_entry_id: row.paymentEntryId,
    paid_cash_account_id: row.paidCashAccountId,
    paid_at: row.paidAt,
    voided_at: row.voidedAt,
    void_reason: row.voidReason,
    created_at: row.createdAt,
}) : null;

export const listVatSettlements = asyncHandler(async (req, res) => {
    const rows = await vatSettlementService.listVatSettlements({ accountId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, rows.map(mapSettlement), "IVA settlements fetched successfully"));
});

export const previewVatSettlement = asyncHandler(async (req, res) => {
    const { periodicity, year, period_number } = req.query;
    const preview = await vatSettlementService.previewVatSettlement({ accountId: req.user.prismaId, periodicity, year, periodNumber: period_number });
    return res.status(200).json(new ApiResponse(200, {
        start_date: preview.range.startDate,
        end_date: preview.range.endDate,
        existing: mapSettlement(preview.existing),
        blockers: preview.blockers,
        generated: preview.result.generated,
        deductible: preview.result.deductible,
        net: preview.result.net,
        available_credit: preview.result.availableCredit,
        carry_forward_applied: preview.result.carryForwardApplied,
        net_payable: preview.result.netPayable,
        credit_balance: preview.result.creditBalance,
        activity_generated: preview.activity.generated,
        activity_deductible: preview.activity.deductible,
        prior_adjustment_generated: preview.priorAdjustments.generated,
        prior_adjustment_deductible: preview.priorAdjustments.deductible,
    }, "IVA settlement preview fetched successfully"));
});

export const settleVatPeriod = asyncHandler(async (req, res) => {
    const { periodicity, year, period_number } = req.body || {};
    const row = await vatSettlementService.settleVatPeriod({ accountId: req.user.prismaId, actorId: req.user.actorId, periodicity, year, periodNumber: period_number });
    return res.status(201).json(new ApiResponse(201, mapSettlement(row), "IVA period settled successfully"));
});

export const voidVatSettlement = asyncHandler(async (req, res) => {
    const row = await vatSettlementService.voidVatSettlement({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, reason: req.body?.reason });
    return res.status(200).json(new ApiResponse(200, mapSettlement(row), "IVA settlement voided successfully"));
});

export const payVatSettlement = asyncHandler(async (req, res) => {
    const { cash_account_id, payment_date } = req.body || {};
    const row = await vatSettlementService.payVatSettlement({ accountId: req.user.prismaId, actorId: req.user.actorId, id: req.params.id, cashAccountId: cash_account_id, paymentDate: payment_date });
    return res.status(200).json(new ApiResponse(200, mapSettlement(row), "IVA settlement paid successfully"));
});
