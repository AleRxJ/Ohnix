import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as discoveryEngine from "../services/discoveryEngine.service.js";
import { EXPLANATION_TAGS } from "../services/discoveryExplanation.service.js";

// Transitions a user can request from the API - "detected"/"investigating"/
// "validated"/"published"/"learned" are set by the engine itself, never by
// a direct user request.
const USER_SETTABLE_STATUSES = ["actioned", "resolved", "dismissed"];

export const listDiscoveries = asyncHandler(async (req, res) => {
    const rows = await discoveryEngine.listDiscoveries({
        accountId: req.user.prismaId,
        status: req.query.status,
        type: req.query.type,
    });
    return res.status(200).json(new ApiResponse(200, rows, "Discoveries fetched successfully."));
});

export const getDiscovery = asyncHandler(async (req, res, next) => {
    const row = await discoveryEngine.getDiscoveryDetail({ accountId: req.user.prismaId, id: req.params.id });
    if (!row) return next(new ApiError(404, "Discovery not found"));
    return res.status(200).json(new ApiResponse(200, row, "Discovery fetched successfully."));
});

export const updateDiscoveryStatus = asyncHandler(async (req, res, next) => {
    const { status, reason } = req.body || {};
    if (!USER_SETTABLE_STATUSES.includes(status)) {
        return next(new ApiError(400, `status must be one of: ${USER_SETTABLE_STATUSES.join(", ")}`));
    }
    const row = await discoveryEngine.updateDiscoveryStatus({ accountId: req.user.prismaId, id: req.params.id, status, reason });
    if (!row) return next(new ApiError(404, "Discovery not found"));
    return res.status(200).json(new ApiResponse(200, row, "Discovery updated successfully."));
});

// Mission case G, generalized: attach (or clear, with an empty string) a
// "¿qué crees que está pasando?" explanation to a Discovery in ANY status -
// unlike the dismiss reason this isn't gated behind closing it. `tag` is
// optional and, when it matches a registered checker for this Discovery's
// detector, gets an immediate evidence-backed verdict (see
// discoveryEngine.service.js#setTeamExplanation).
export const setDiscoveryExplanation = asyncHandler(async (req, res, next) => {
    const { explanation, tag } = req.body || {};
    if (tag && !EXPLANATION_TAGS.includes(tag)) {
        return next(new ApiError(400, `tag must be one of: ${EXPLANATION_TAGS.join(", ")}`));
    }
    const row = await discoveryEngine.setTeamExplanation({ accountId: req.user.prismaId, id: req.params.id, explanation, tag });
    if (!row) return next(new ApiError(404, "Discovery not found"));
    return res.status(200).json(new ApiResponse(200, row, "Discovery explanation saved successfully."));
});
