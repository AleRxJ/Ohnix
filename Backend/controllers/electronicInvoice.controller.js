import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    getElectronicInvoiceForOrder,
    issueElectronicInvoiceForOrder,
    processFactusWebhook,
    listElectronicInvoices,
} from "../services/electronicInvoicing.service.js";

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
        .json(new ApiResponse(200, data, "Electronic invoice sent to Factus successfully"));
});

export const handleFactusWebhook = async (req, res) => {
    try {
        const result = await processFactusWebhook({
            payload: req.body || {},
            headers: req.headers || {},
        });

        return res.status(200).json({
            received: true,
            ...result,
        });
    } catch (error) {
        return res.status(error?.statusCode || 400).json({
            received: false,
            message: error?.message || "Invalid Factus webhook payload",
        });
    }
};

export const getElectronicInvoices = asyncHandler(async (req, res) => {
    const data = await listElectronicInvoices({
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        status: req.query.status,
        search: req.query.search,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic invoices fetched successfully"));
});
