import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as posService from "../services/pointOfSale.service.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";

// GET /points-of-sale - "which locations can I see at all", not gated by
// the pointsOfSale module permission - same rule team.controller.js's
// requireTeamAccess uses for "can I see my own team's basic info": knowing
// which locations exist (so a switcher/selector can render) is not the
// same privilege as administering them. isTeamMember: false (the owner, or
// a solo user) always gets everything, same as everywhere else.
export const listPointOfSales = asyncHandler(async (req, res) => {
    const all = await posService.listPointOfSales(req.user.prismaId);

    const visible = req.user.posScopeAll
        ? all
        : all.filter((pos) => (req.user.posScopeIds || []).includes(pos.id));

    return res.status(200).json(new ApiResponse(200, visible, "Points of sale fetched successfully"));
});

export const createPointOfSale = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);
    posService.assertCanAddSecondLocation(getEffectivePlan(subscription));

    const pos = await posService.createPointOfSale({
        accountId: req.user.prismaId,
        name: req.body?.name,
    });
    return res.status(201).json(new ApiResponse(201, pos, "Point of sale created successfully"));
});

export const updatePointOfSale = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { name, isActive } = req.body || {};

    if (name !== undefined) {
        const updated = await posService.renamePointOfSale({
            accountId: req.user.prismaId,
            pointOfSaleId: id,
            name,
        });
        return res.status(200).json(new ApiResponse(200, updated, "Point of sale updated successfully"));
    }

    if (isActive === false) {
        const updated = await posService.deactivatePointOfSale({
            accountId: req.user.prismaId,
            pointOfSaleId: id,
        });
        return res.status(200).json(new ApiResponse(200, updated, "Point of sale deactivated successfully"));
    }

    return next(new ApiError(400, "Proporciona name para renombrar, o isActive: false para desactivar"));
});
