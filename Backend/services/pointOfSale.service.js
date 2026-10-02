import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureActiveSubscription, ensureUserSubscription, getEffectivePlan, getPlanFeatures, getPlanLimits } from "../middleware/pricing.middleware.js";
import { emitAccountEvent } from "../live/dataEvents.js";
import { publishPosScopeChange } from "../utils/posScopeStore.js";

const LOCATION_TYPES = new Set(["point_of_sale", "warehouse", "distribution_center"]);

// Every account (team owner or solo user - see teamContext.js) has exactly
// one default PointOfSale, created lazily the first time anything asks for
// it rather than at signup - this way there is exactly one place in the
// codebase that has to remember accounts need one (here), instead of every
// current and future account-creation path (registration, OAuth, an admin
// creating a user...). Existing accounts got theirs from the
// add-point-of-sale migration's backfill; this covers every account created
// after that migration ran.
export const ensureDefaultPointOfSale = async (accountId) => {
    const existing = await prisma.pointOfSale.findFirst({
        where: { accountId, isDefault: true },
    });
    if (existing) return existing;

    const created = await prisma.pointOfSale.create({
        data: { accountId, name: "Principal", isDefault: true, isActive: true },
    });
    // Sockets that connected before this row existed never joined its room
    // (socketServer.js#joinPosRoomsForUser runs at connect), so live POS
    // events - tables, kitchen - would silently not reach them until a
    // reconnect. Same nudge createPointOfSale gives.
    emitAccountEvent(accountId, "pointOfSale", "created");
    publishPosScopeChange({ accountId }).catch(() => {});
    return created;
};

export const listPointOfSales = async (accountId) =>
    prisma.pointOfSale.findMany({
        where: { accountId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

// Plan-feature/limit checks (enforcePlanFeature('multiLocation'),
// enforceEntityLimit('pointsOfSale')) already ran as route middleware
// before this - see pointOfSale.routes.js. This only handles what those
// generic middlewares can't: creating a second location requires the
// account to actually be allowed more than one at all, which is really
// just re-stating multiLocation, kept here too as a defense against this
// service ever being called from somewhere that skipped the route guard.
export const createPointOfSale = async ({ accountId, name, locationType }) => {
    const trimmed = `${name || ""}`.trim();
    if (!trimmed) {
        throw new ApiError(400, "El nombre del punto de venta es obligatorio.");
    }
    if (locationType !== undefined && !LOCATION_TYPES.has(locationType)) {
        throw new ApiError(400, "El tipo de ubicación no es válido.");
    }

    const pos = await prisma.pointOfSale.create({
        data: { accountId, name: trimmed, locationType: locationType || "point_of_sale", isDefault: false, isActive: true },
    });

    emitAccountEvent(accountId, "pointOfSale", "created");
    // Full-scope sockets already connected have no way to know this room
    // exists yet - force them to reconnect so they join it (see
    // utils/posScopeStore.js).
    publishPosScopeChange({ accountId }).catch(() => {});
    return pos;
};

export const renamePointOfSale = async ({ accountId, pointOfSaleId, name, locationType }) => {
    const trimmed = `${name || ""}`.trim();
    if (!trimmed) {
        throw new ApiError(400, "El nombre del punto de venta es obligatorio.");
    }
    if (locationType !== undefined && !LOCATION_TYPES.has(locationType)) {
        throw new ApiError(400, "El tipo de ubicación no es válido.");
    }

    const existing = await prisma.pointOfSale.findUnique({ where: { id: pointOfSaleId } });
    if (!existing || existing.accountId !== accountId) {
        throw new ApiError(404, "Punto de venta no encontrado.");
    }

    const updated = await prisma.pointOfSale.update({
        where: { id: pointOfSaleId },
        data: { name: trimmed, ...(locationType !== undefined ? { locationType } : {}) },
    });

    emitAccountEvent(accountId, "pointOfSale", "updated");
    return updated;
};

// Soft-delete only, same principle as TeamMemberStatus.removed and
// Company.isActive - historical Orders/Purchases/StockMovements keep
// pointing at a real row (the FK is ON DELETE RESTRICT, so a hard delete
// would be blocked anyway the moment any data references it). A
// deactivated location also stops counting against
// PLAN_LIMITS.maxPointsOfSale (see pricing.middleware.js#enforceEntityLimit)
// and drops out of every member's scope automatically, since scope checks
// only ever look at isActive: true locations.
export const deactivatePointOfSale = async ({ accountId, pointOfSaleId }) => {
    const existing = await prisma.pointOfSale.findUnique({ where: { id: pointOfSaleId } });
    if (!existing || existing.accountId !== accountId) {
        throw new ApiError(404, "Punto de venta no encontrado.");
    }
    if (existing.isDefault) {
        throw new ApiError(400, "El punto de venta principal no se puede desactivar.");
    }
    // An open table tab is a sale in progress - deactivating would strand it
    // (out of every scope, uncollectable). Close or move them first.
    const openTabs = await prisma.tableTab.count({ where: { pointOfSaleId, status: "open" } });
    if (openTabs) {
        throw new ApiError(
            409,
            `Este punto de venta tiene ${openTabs} ${openTabs === 1 ? "mesa con cuenta abierta" : "mesas con cuenta abierta"}; cóbralas o cancélalas antes de desactivarlo.`,
            [],
            "",
            "point_of_sale_has_open_tabs"
        );
    }

    const updated = await prisma.pointOfSale.update({
        where: { id: pointOfSaleId },
        data: { isActive: false },
    });

    emitAccountEvent(accountId, "pointOfSale", "deactivated");
    publishPosScopeChange({ accountId }).catch(() => {});
    return updated;
};

// Bringing a deactivated location back. Its tables, history and stock come
// back with it (they were never touched). It counts against the plan's
// location limit again, so that's re-checked here - the route can't run
// enforceEntityLimit for a PATCH that may just be a rename.
export const reactivatePointOfSale = async ({ accountId, pointOfSaleId, skipLimit = false }) => {
    const existing = await prisma.pointOfSale.findUnique({ where: { id: pointOfSaleId } });
    if (!existing || existing.accountId !== accountId) {
        throw new ApiError(404, "Punto de venta no encontrado.");
    }
    if (existing.isActive) return existing;

    if (!skipLimit) {
        const subscription = await ensureUserSubscription(accountId);
        ensureActiveSubscription(subscription);
        const limit = getPlanLimits(getEffectivePlan(subscription)).maxPointsOfSale;
        if (limit !== null && limit !== undefined) {
            const active = await prisma.pointOfSale.count({ where: { accountId, isActive: true } });
            if (active + 1 > limit) {
                throw new ApiError(403, `Tu plan permite hasta ${limit} ${limit === 1 ? "punto de venta activo" : "puntos de venta activos"}.`, [], "", "point_of_sale_limit");
            }
        }
    }

    const updated = await prisma.pointOfSale.update({ where: { id: pointOfSaleId }, data: { isActive: true } });
    emitAccountEvent(accountId, "pointOfSale", "reactivated");
    publishPosScopeChange({ accountId }).catch(() => {});
    return updated;
};

// Called before letting an account create a second (or later) location -
// enforcePlanFeature/enforceEntityLimit already gate the route, this is the
// one non-generic rule: an account that currently has zero Escala access at
// all should get a clear "upgrade to Escala" message rather than the
// generic plan-limit-reached wording, since maxPointsOfSale is 1 on every
// non-Escala plan and would otherwise read as an arbitrary cap rather than
// a tier boundary.
export const assertCanAddSecondLocation = (plan) => {
    if (!getPlanFeatures(plan).multiLocation) {
        throw new ApiError(
            403,
            "Múltiples puntos de venta requieren el plan Escala. Actualiza tu plan para agregar otra ubicación."
        );
    }
};
