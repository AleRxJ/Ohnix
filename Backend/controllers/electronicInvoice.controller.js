import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    getElectronicInvoiceForOrder,
    getElectronicInvoicePdfContext,
    issueElectronicInvoiceForOrder,
    syncElectronicInvoiceStatus,
    listElectronicInvoices,
    issueCreditNoteForInvoice,
    listCreditNotesForInvoice,
    retryCreditNoteLocalEffect,
} from "../services/electronicInvoicing.service.js";
import { renderElectronicInvoicePdf } from "../services/electronicInvoicePdf.service.js";

export const getOrderElectronicInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await getElectronicInvoiceForOrder({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Electronic invoice fetched successfully"));
});

export const issueOrderElectronicInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await issueElectronicInvoiceForOrder({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        trigger: "manual_api",
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Electronic invoice sent successfully"));
});

export const syncOrderElectronicInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await syncElectronicInvoiceStatus({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Electronic invoice status synced successfully"));
});

export const issueOrderCreditNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { concept_code, observation, items, amount, tax_rate } = req.body;

    const data = await issueCreditNoteForInvoice({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        conceptCode: concept_code,
        observation,
        items,
        amount,
        taxRate: tax_rate,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Credit note sent successfully"));
});

export const getOrderCreditNotes = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await listCreditNotesForInvoice({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Credit notes fetched successfully"));
});

export const retryOrderCreditNoteLocalEffect = asyncHandler(async (req, res) => {
    const data = await retryCreditNoteLocalEffect({
        orderId: req.params.id,
        creditNoteId: req.params.creditNoteId,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Credit note local effect applied successfully"));
});

export const downloadOrderElectronicInvoicePdf = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const context = await getElectronicInvoicePdfContext({
        orderId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    await renderElectronicInvoicePdf(res, context);
});

export const getElectronicInvoices = asyncHandler(async (req, res) => {
    const data = await listElectronicInvoices({
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        status: req.query.status,
        search: req.query.search,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic invoices fetched successfully"));
});
