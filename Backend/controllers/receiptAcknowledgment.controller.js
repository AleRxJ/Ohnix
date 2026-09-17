import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    getReceiptForPurchase,
    listReceivedInvoiceReceipts,
    recordSupplierInvoiceReference,
    triggerAcuseDeReciboForPurchase,
    triggerAceptacionExpresaForPurchase,
    triggerReclamoForPurchase,
    syncReceiptEventStatus,
} from "../services/receiptAcknowledgment.service.js";

export const getPurchaseReceiptAcknowledgment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await getReceiptForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Receipt acknowledgment fetched successfully"));
});

export const recordPurchaseSupplierInvoiceReference = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { supplier_invoice_number, supplier_cufe, supplier_issued_at } = req.body || {};
    const data = await recordSupplierInvoiceReference({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        supplierInvoiceNumber: supplier_invoice_number,
        supplierCufe: supplier_cufe,
        supplierIssuedAt: supplier_issued_at,
    });
    return res.status(200).json(new ApiResponse(200, data, "Supplier invoice reference recorded successfully"));
});

export const triggerPurchaseAcuseDeRecibo = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await triggerAcuseDeReciboForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Acuse de recibo sent successfully"));
});

export const triggerPurchaseAceptacionExpresa = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await triggerAceptacionExpresaForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Aceptación expresa sent successfully"));
});

export const triggerPurchaseReclamo = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    const data = await triggerReclamoForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        reason,
    });
    return res.status(200).json(new ApiResponse(200, data, "Reclamo sent successfully"));
});

export const syncPurchaseReceiptAcknowledgment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { eventType } = req.body || {};
    const data = await syncReceiptEventStatus({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        eventType,
    });
    return res.status(200).json(new ApiResponse(200, data, "Receipt acknowledgment status synced successfully"));
});

export const getMyReceivedInvoiceReceipts = asyncHandler(async (req, res) => {
    const data = await listReceivedInvoiceReceipts({
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        search: req.query.search,
    });
    return res.status(200).json(new ApiResponse(200, data, "Received invoice receipts fetched successfully"));
});
