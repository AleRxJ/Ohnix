import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { listPaymentVerifications, setPaymentVerification } from "../services/paymentVerification.service.js";

export const getPaymentVerifications = asyncHandler(async (req, res) => {
    const data = await listPaymentVerifications({ user: req.user, status: req.query.status, limit: req.query.limit });
    return res.status(200).json(new ApiResponse(200, data, "Payment verifications fetched"));
});

export const patchPaymentVerification = asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    const payment = await setPaymentVerification({ user: req.user, paymentId: req.params.paymentId, status, note });
    return res.status(200).json(new ApiResponse(200, payment, "Payment verification updated"));
});
