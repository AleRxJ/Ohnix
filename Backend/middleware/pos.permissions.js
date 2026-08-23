import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureDefaultPointOfSale } from "../services/pointOfSale.service.js";

// Scope enforcement for Points of Sale - the "where" half of authorization,
// orthogonal to team.permissions.js's "what" (module × level). Both must
// pass; neither substitutes for the other. See auth.middleware.js /
// teamContext.js for where req.user.posScopeAll/posScopeIds come from.
//
// Mirrors the account-isolation pattern already used everywhere else in
// this codebase (e.g. product.controller.js: fetch the record, then compare
// `existingProduct.createdById !== req.user.prismaId`) - centralized here
// instead of re-implemented per controller, since a second manually-copied
// scope check is exactly the kind of thing a new endpoint forgets to add.

export const hasPosAccess = (user, pointOfSaleId) => {
    if (!pointOfSaleId) return false;
    if (user?.posScopeAll) return true;
    return Array.isArray(user?.posScopeIds) && user.posScopeIds.includes(pointOfSaleId);
};

// Use after fetching a record that has its own pointOfSaleId (order,
// purchase, stock movement...) - same call shape as the
// `if (record.createdById !== req.user.prismaId) throw 403` pattern already
// used across the controllers, so it drops into existing code with minimal
// churn.
export const assertPosAccess = (user, pointOfSaleId, message = "No tienes acceso a este punto de venta.") => {
    if (!hasPosAccess(user, pointOfSaleId)) {
        throw new ApiError(403, message);
    }
};

// hasPosAccess/assertPosAccess only check the in-memory scope (posScopeAll/
// posScopeIds) - correct for the post-fetch use case above, where the
// record's own existence and account ownership were already proven by the
// query that fetched it. For a *client-supplied* id (create requests -
// nothing has been fetched yet), that's not enough on its own: a full-scope
// actor (owner, or a member with posScopeAll: true) passes hasPosAccess for
// literally any string, since "all" has no finite list to check against.
// Without this, a forged/nonexistent pointOfSaleId sails past the scope
// check and only fails later as an unhandled foreign-key error when the
// create actually runs - a 500, not the 403/404 a bad request should get.
// Restricted-scope ids don't strictly need this (changeMemberScope already
// validated every id in posScopeIds belongs to the account when it was
// assigned), but it's cheap enough to apply uniformly rather than trust
// that invariant never drifts.
export const assertPointOfSaleExists = async (accountId, pointOfSaleId) => {
    const pos = await prisma.pointOfSale.findFirst({
        where: { id: pointOfSaleId, accountId, isActive: true },
        select: { id: true },
    });
    if (!pos) {
        throw new ApiError(404, "Punto de venta no encontrado.");
    }
};

// Gate for actions that touch a location's *ownership* of a record rather
// than just operating within it (e.g. reassigning a customer/supplier from
// one point of sale to another - see customer.controller.js#reassignCustomerPointOfSale).
// Deliberately stricter than hasPosAccess("both ends"): moving a record's
// home location is an administrative correction, not a routine operation
// like a stock transfer, so it's reserved for whoever can see the account's
// entire location picture (owner, a member explicitly granted posScopeAll,
// or the platform admin role) - not merely someone who happens to have both
// the old and new location in their own scope.
export const assertFullPosScope = (user, message = "Solo alguien con acceso a todos los puntos de venta puede hacer esto.") => {
    if (user.role !== "admin" && !user.posScopeAll) {
        throw new ApiError(403, message);
    }
};

// Route middleware for creates/updates where the target PointOfSale comes
// from the request itself (body.pointOfSaleId by default) rather than from
// a record already fetched. Rejects a client trying to write into a
// location outside its scope by simply sending a different id - the exact
// "Carlos sends pointOfSaleId=BOGOTA" case this exists for.
export const requirePosAccessBody = (field = "pointOfSaleId") =>
    asyncHandler(async (req, _res, next) => {
        const pointOfSaleId = req.body?.[field];
        if (!pointOfSaleId) {
            return next(new ApiError(400, `${field} es obligatorio.`));
        }
        assertPosAccess(req.user, pointOfSaleId);
        await assertPointOfSaleExists(req.user.prismaId, pointOfSaleId);
        next();
    });

// Resolves "the" PointOfSale for a request that didn't specify one -
// backward compatibility for every existing client (frontend included)
// that doesn't send pointOfSaleId yet. Every account has exactly one
// default location unless it's on Escala and created more (see
// pointOfSale.service.js), so this only needs to disambiguate when there's
// more than one - at which point silently guessing would be wrong, and the
// caller must have sent an explicit pointOfSaleId instead. get-or-creates
// rather than assuming one already exists, so an account created after the
// add-point-of-sale migration (which only backfilled accounts that existed
// at the time) is still self-healing on its first order/purchase.
export const resolveDefaultPointOfSaleId = async (accountId) => {
    const defaultPos = await ensureDefaultPointOfSale(accountId);
    return defaultPos.id;
};

// Used by create endpoints (orders, purchases, stock movements): if the
// request already named a pointOfSaleId, verify it's in scope; otherwise
// fall back to the account's single default location. Throws (never
// silently multiplexes) if the account has more than one active location
// and the request didn't say which - see resolveDefaultPointOfSaleId.
export const resolveOrAssertPointOfSaleId = async (req) => {
    const requested = req.body?.pointOfSaleId;
    if (requested) {
        assertPosAccess(req.user, requested);
        await assertPointOfSaleExists(req.user.prismaId, requested);
        return requested;
    }

    // No explicit pointOfSaleId - every current frontend form. Guessing is
    // only safe when there's exactly one possibility from *this actor's*
    // point of view, not the account's total: a restricted-scope member
    // pinned to a single location has an unambiguous answer even on an
    // Escala account with several locations (the account-wide count below
    // would otherwise force them to specify one, which no client sends
    // yet). A full-scope actor (owner, posScopeAll, admin) falls through to
    // the account-wide count, since "all of them" has no single answer to
    // pick from either.
    if (req.user.role !== "admin" && !req.user.posScopeAll) {
        const scopeIds = req.user.posScopeIds || [];
        if (scopeIds.length === 1) {
            await assertPointOfSaleExists(req.user.prismaId, scopeIds[0]);
            return scopeIds[0];
        }
        if (scopeIds.length > 1) {
            throw new ApiError(400, "pointOfSaleId es obligatorio: tienes acceso a más de un punto de venta.");
        }
        throw new ApiError(403, "No tienes acceso a ningún punto de venta.");
    }

    const activeCount = await prisma.pointOfSale.count({
        where: { accountId: req.user.prismaId, isActive: true },
    });
    if (activeCount > 1) {
        throw new ApiError(400, "pointOfSaleId es obligatorio: esta cuenta tiene más de un punto de venta.");
    }
    return resolveDefaultPointOfSaleId(req.user.prismaId);
};
