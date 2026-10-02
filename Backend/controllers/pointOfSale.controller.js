import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as posService from "../services/pointOfSale.service.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";
import { hasPosAccess } from "../middleware/pos.permissions.js";

// GET /points-of-sale - "which locations exist at all", not gated by the
// pointsOfSale module permission and, as of the 2026-08-21 transfer-scope
// revision, NOT filtered down to the caller's own posScope either. Knowing
// a location's name isn't sensitive the way its stock is (that's what
// getLocationStockSummary scope-filters) - and a restricted-scope member
// needs to see locations outside their own scope to name one as the source
// of a transfer *request* (see stockTransfer.controller.js#createTransferRequest:
// requesting only needs destination access, on purpose, so "which
// locations could I possibly request from" has to include ones the
// requester can't manage). Full-scope actors (owner, admin, posScopeAll)
// see inactive locations too (for the management table); a restricted
// member only sees active ones, since an inactive location is never a
// valid transfer endpoint for anyone.
export const listPointOfSales = asyncHandler(async (req, res) => {
    const all = await posService.listPointOfSales(req.user.prismaId);

    const visible =
        req.user.role === "admin" || req.user.posScopeAll ? all : all.filter((pos) => pos.isActive);

    // inOwnScope lets the frontend distinguish "a location I can request
    // stock FROM" (someone else's) from "a location that's already mine"
    // (see RequestTransferModal - requesting a transfer from your own
    // scope to your own scope is meaningless, that's what "traslado
    // rápido" is for) without re-deriving hasPosAccess's logic client-side.
    // Full-scope actors (owner, admin, posScopeAll) own every location, so
    // this is always true for them - which is also exactly why the
    // frontend must special-case "everything is in scope" back to "show
    // everything" instead of filtering to an empty list.
    const withScope = visible.map((pos) => ({
        ...pos,
        inOwnScope: req.user.role === "admin" ? true : hasPosAccess(req.user, pos.id),
    }));

    return res.status(200).json(new ApiResponse(200, withScope, "Points of sale fetched successfully"));
});

export const createPointOfSale = asyncHandler(async (req, res) => {
    const subscription = await ensureUserSubscription(req.user.prismaId);
    posService.assertCanAddSecondLocation(getEffectivePlan(subscription));

    const pos = await posService.createPointOfSale({
        accountId: req.user.prismaId,
        name: req.body?.name,
        locationType: req.body?.location_type,
    });
    return res.status(201).json(new ApiResponse(201, pos, "Point of sale created successfully"));
});

export const updatePointOfSale = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { name, isActive, location_type: locationType } = req.body || {};

    if (name !== undefined) {
        const updated = await posService.renamePointOfSale({
            accountId: req.user.prismaId,
            pointOfSaleId: id,
            name,
            locationType,
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

    if (isActive === true) {
        const updated = await posService.reactivatePointOfSale({
            accountId: req.user.prismaId,
            pointOfSaleId: id,
            skipLimit: req.user.role === "admin",
        });
        return res.status(200).json(new ApiResponse(200, updated, "Point of sale reactivated successfully"));
    }

    return next(new ApiError(400, "Proporciona name para renombrar, o isActive: true/false para activar o desactivar"));
});
