// Admin-only read/write for DiscoveryDimensionConfig - lets an operator
// turn a registered-but-dormant search dimension on (or a default-on one
// off) for a config-driven detector without a deploy. See
// crossFactorCorrelation.detector.js's DIMENSION_REGISTRY comment and
// DiscoveryDimensionConfig's schema.prisma comment for why this is data
// instead of the detector writing its own code.

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { DIMENSION_METADATA, DETECTOR_KEY as CROSS_FACTOR_DETECTOR_KEY } from "../services/detectors/crossFactorCorrelation.detector.js";

// Every config-driven detector registers its dimension metadata here - just
// this one so far; a future one adds itself the same way.
const REGISTRIES = { [CROSS_FACTOR_DETECTOR_KEY]: DIMENSION_METADATA };

export const listDimensionConfig = asyncHandler(async (req, res, next) => {
    const { detectorKey } = req.query;
    const metadata = REGISTRIES[detectorKey];
    if (!metadata) {
        return next(new ApiError(400, `detectorKey must be one of: ${Object.keys(REGISTRIES).join(", ")}`));
    }

    const overrides = await prisma.discoveryDimensionConfig.findMany({ where: { detectorKey } });
    const overrideByKey = new Map(overrides.map((o) => [o.dimensionKey, o]));

    const rows = metadata.map((d) => {
        const override = overrideByKey.get(d.key);
        return {
            key: d.key,
            label: d.label,
            default_enabled: d.defaultEnabled,
            enabled: override ? override.enabled : d.defaultEnabled,
            has_override: Boolean(override),
            updated_at: override?.updatedAt ?? null,
        };
    });
    return res.status(200).json(new ApiResponse(200, rows, "Dimension config fetched successfully."));
});

export const setDimensionConfig = asyncHandler(async (req, res, next) => {
    const { detectorKey, dimensionKey, enabled } = req.body || {};
    const metadata = REGISTRIES[detectorKey];
    if (!metadata) {
        return next(new ApiError(400, `detectorKey must be one of: ${Object.keys(REGISTRIES).join(", ")}`));
    }
    if (!metadata.some((d) => d.key === dimensionKey)) {
        return next(new ApiError(400, `dimensionKey for ${detectorKey} must be one of: ${metadata.map((d) => d.key).join(", ")}`));
    }
    if (typeof enabled !== "boolean") {
        return next(new ApiError(400, "enabled must be a boolean"));
    }

    const row = await prisma.discoveryDimensionConfig.upsert({
        where: { detectorKey_dimensionKey: { detectorKey, dimensionKey } },
        update: { enabled, updatedById: req.user.prismaId },
        create: { detectorKey, dimensionKey, enabled, updatedById: req.user.prismaId },
    });
    return res.status(200).json(new ApiResponse(200, row, "Dimension config updated successfully."));
});
