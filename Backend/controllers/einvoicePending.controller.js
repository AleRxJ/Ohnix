import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { listPendingEinvoices, countPendingEinvoices, changeDeferredOrderCustomer } from "../services/einvoicePending.service.js";
import { getOrderReceipt } from "../services/orderReceipt.service.js";

export const getPendingEinvoices = asyncHandler(async (req, res) => {
    const orders = await listPendingEinvoices({ user: req.user });
    return res.status(200).json(new ApiResponse(200, { orders, count: orders.length }, "Pending e-invoices fetched"));
});

export const getPendingEinvoicesCount = asyncHandler(async (req, res) => {
    const count = await countPendingEinvoices({ user: req.user });
    return res.status(200).json(new ApiResponse(200, { count }, "Pending e-invoices counted"));
});

export const patchDeferredOrderCustomer = asyncHandler(async (req, res) => {
    const { customer_id } = req.body || {};
    if (!customer_id) throw new ApiError(400, "customer_id is required.");
    const result = await changeDeferredOrderCustomer({ user: req.user, orderId: req.params.id, customerId: customer_id });
    return res.status(200).json(new ApiResponse(200, result, "Customer updated"));
});

export const getOrderReceiptData = asyncHandler(async (req, res) => {
    const receipt = await getOrderReceipt({ user: req.user, orderId: req.params.id });
    return res.status(200).json(new ApiResponse(200, receipt, "Receipt fetched"));
});
