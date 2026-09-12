import { getIO, accountRoom, posRoom, platformAdminRoom } from "./socketServer.js";

// Account-wide "this changed" broadcast - deliberately payload-free beyond
// resource/action. The multi-user concurrency audit (2026-08-20) found that
// presence/locks were genuinely realtime but no product/order/purchase/etc.
// mutation ever reached other connected users; this closes that gap the
// cheapest way that's still correct: tell every other tab on the account
// which list might be stale, and let it re-run the same fetch it already
// uses on mount (see Frontend/src/hooks/useDataInvalidation.js) instead of
// trying to keep a pushed payload's shape in sync with the REST response's.
//
// Use this only for account-wide resources - ones with no single Point of
// Sale owner (category, unit, customer, supplier, the Product entity
// itself, team/roles, and PointOfSale list changes). Anything attributed to
// one location (orders, purchases, stock movements) must use emitPosEvent
// below instead - broadcasting those account-wide would leak "something
// changed" to every connected user regardless of their location scope,
// exactly what the architecture audit's LIVE section rejected.
export const emitAccountEvent = (accountId, resource, action = "changed") => {
    const io = getIO();
    if (!io || !accountId) return;
    io.to(accountRoom(accountId)).emit("data:changed", { resource, action, at: Date.now() });
};

// Location-scoped counterpart to emitAccountEvent - only reaches sockets
// whose owner has this Point of Sale in scope (see socketServer.js's
// joinPosRoomsForUser, which is what put them in this room in the first
// place). Same payload-free shape and same client-side handling
// (useDataInvalidation.js doesn't care which room delivered the event).
export const emitPosEvent = (accountId, pointOfSaleId, resource, action = "changed") => {
    const io = getIO();
    if (!io || !accountId || !pointOfSaleId) return;
    io.to(posRoom(accountId, pointOfSaleId)).emit("data:changed", { resource, action, at: Date.now() });
};

// Platform-wide counterpart for the one screen with no account boundary -
// the Ohnix admin's global "Sesiones" tab. Every connected admin gets this
// regardless of whose account the change belongs to (see platformAdminRoom
// in socketServer.js) - everyone else's account-scoped emitAccountEvent
// above is what keeps their own team's/self view live instead.
export const emitAdminEvent = (resource, action = "changed") => {
    const io = getIO();
    if (!io) return;
    io.to(platformAdminRoom()).emit("data:changed", { resource, action, at: Date.now() });
};
