// Backend/controllers/externalApiBilling.controller.js
//
// Public, unauthenticated - reached only via the single-use link an admin
// generates and hands to an external API client (see
// createBillingEnrollmentLink in externalApiClient.service.js). Never
// accepts raw card fields: the frontend tokenizes the card client-side,
// straight to ePayco's own servers (see Frontend/src/pages/
// EnrollApiBilling.jsx), and only submits the resulting token id here.

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { getBillingEnrollmentPreview, completeBillingEnrollment } from "../services/externalApiClient.service.js";

export const getMyBillingEnrollmentPreview = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const data = await getBillingEnrollmentPreview({ token });
    return res.status(200).json(new ApiResponse(200, data, "Enrollment link valid"));
});

export const completeMyBillingEnrollment = asyncHandler(async (req, res, next) => {
    const { token } = req.params;
    const { tokenCard } = req.body || {};
    if (!tokenCard?.trim()) {
        return next(new ApiError(400, "tokenCard is required"));
    }
    const data = await completeBillingEnrollment({ token, tokenCard: tokenCard.trim() });
    return res.status(200).json(new ApiResponse(200, data, "Billing enrollment completed"));
});
