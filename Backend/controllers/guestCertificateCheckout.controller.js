// Backend/controllers/guestCertificateCheckout.controller.js
//
// Public, unauthenticated entry point for CertificadosDigitales.jsx's guest
// checkout form - creates the Ohnix account + Company + CertificateOrder in
// one call (see guestCertificateCheckout.service.js) and auto-logs the
// browser in via cookies, exactly like a normal login/register would.

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { issueAuthTokens, AUTH_COOKIE_OPTIONS } from "../utils/authTokens.js";
import { registerGuestCompanyForCertificate } from "../services/guestCertificateCheckout.service.js";

const VALID_DURATIONS = [1, 2];

export const registerForCertificateCheckout = asyncHandler(async (req, res, next) => {
    const {
        companyName,
        taxIdentification,
        taxIdentificationDv,
        personType,
        contactName,
        contactEmail,
        contactPhone,
        durationYears,
    } = req.body || {};

    // Same per-field 400 style as createExternalApiClientAdmin
    // (company.controller.js) - explicit checks so a missing field 400s
    // cleanly instead of surfacing as a confusing error deeper in the stack.
    if (!companyName?.trim()) {
        return next(new ApiError(400, "companyName is required"));
    }
    if (!taxIdentification?.trim()) {
        return next(new ApiError(400, "taxIdentification is required"));
    }
    const normalizedDv = `${taxIdentificationDv ?? ""}`.trim();
    if (!normalizedDv) {
        return next(new ApiError(400, "taxIdentificationDv is required"));
    }
    if (!personType?.trim()) {
        return next(new ApiError(400, "personType is required"));
    }
    if (!contactEmail?.trim()) {
        return next(new ApiError(400, "contactEmail is required"));
    }

    const normalizedDurationYears = Number(durationYears);
    if (!VALID_DURATIONS.includes(normalizedDurationYears)) {
        return next(new ApiError(400, "durationYears must be 1 or 2"));
    }

    const { user, order } = await registerGuestCompanyForCertificate({
        companyName: companyName.trim(),
        taxIdentification: taxIdentification.trim(),
        taxIdentificationDv: normalizedDv,
        personType: personType.trim(),
        contactName: contactName?.trim() || null,
        contactEmail: contactEmail.trim().toLowerCase(),
        contactPhone: contactPhone?.trim() || null,
        durationYears: normalizedDurationYears,
    });

    // Mints a brand-new session exactly like endImpersonation/loginUser do -
    // the account didn't exist a moment ago, so there's nothing to "resume",
    // just a fresh login.
    const { accessToken, refreshToken } = await issueAuthTokens(user.id, {
        deviceInfo: req.header("User-Agent"),
    });

    // Only orderId goes back in the body - the frontend only needs it to
    // navigate to the existing checkout page, nothing about the new
    // user/company should leak into this public response.
    return res
        .status(201)
        .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS.access)
        .cookie("refreshToken", refreshToken, AUTH_COOKIE_OPTIONS.refresh)
        .json(new ApiResponse(201, { orderId: order.id }, "Cuenta y orden de certificado creadas"));
});
