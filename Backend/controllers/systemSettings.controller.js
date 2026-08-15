import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getColombiaTaxSettings, setColombiaTaxSettings } from "../utils/systemSettings.js";

// Colombia's general VAT rate, the ET art. 437 par. 3 UVT threshold, and the
// UVT's current peso value all change by government decree/resolution, not
// by an Ohnix deploy (see schema.prisma's SystemSetting comment) - this is
// the only place an admin can update them without touching code.
export const getColombiaTaxSettingsAdmin = asyncHandler(async (_req, res) => {
    const settings = await getColombiaTaxSettings();
    return res
        .status(200)
        .json(new ApiResponse(200, settings, "Colombia tax settings fetched successfully"));
});

export const updateColombiaTaxSettingsAdmin = asyncHandler(async (req, res, next) => {
    const { vatRate, vatResponsibleThresholdUvt, uvtValue } = req.body;

    if (
        vatRate !== undefined &&
        (Number.isNaN(Number(vatRate)) || Number(vatRate) < 0 || Number(vatRate) > 100)
    ) {
        return next(new ApiError(400, "vatRate must be a number between 0 and 100"));
    }
    if (
        vatResponsibleThresholdUvt !== undefined &&
        (!Number.isInteger(Number(vatResponsibleThresholdUvt)) || Number(vatResponsibleThresholdUvt) < 0)
    ) {
        return next(new ApiError(400, "vatResponsibleThresholdUvt must be a non-negative integer"));
    }
    if (uvtValue !== undefined && (Number.isNaN(Number(uvtValue)) || Number(uvtValue) < 0)) {
        return next(new ApiError(400, "uvtValue must be a non-negative number"));
    }

    const settings = await setColombiaTaxSettings({
        vatRate: vatRate !== undefined ? Number(vatRate) : undefined,
        vatResponsibleThresholdUvt:
            vatResponsibleThresholdUvt !== undefined ? Number(vatResponsibleThresholdUvt) : undefined,
        uvtValue: uvtValue !== undefined ? Number(uvtValue) : undefined,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, settings, "Colombia tax settings updated successfully"));
});
