import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    getSupportDocumentForPurchase,
    issueSupportDocumentForPurchase,
    syncSupportDocumentStatus,
    listSupportDocuments,
} from "../services/purchaseSupportDocument.service.js";

export const getPurchaseSupportDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await getSupportDocumentForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Documento Soporte fetched successfully"));
});

export const issuePurchaseSupportDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await issueSupportDocumentForPurchase({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        trigger: "manual_api",
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Documento Soporte sent successfully"));
});

export const syncPurchaseSupportDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await syncSupportDocumentStatus({
        purchaseId: id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Documento Soporte status synced successfully"));
});

export const getPurchaseSupportDocuments = asyncHandler(async (req, res) => {
    const data = await listSupportDocuments({
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        status: req.query.status,
        search: req.query.search,
    });
    return res.status(200).json(new ApiResponse(200, data, "Documentos Soporte fetched successfully"));
});
