import { getIO, accountRoom } from "./socketServer.js";

// Account-wide "this changed" broadcast - deliberately payload-free beyond
// resource/action. The multi-user concurrency audit (2026-08-20) found that
// presence/locks were genuinely realtime but no product/order/purchase/etc.
// mutation ever reached other connected users; this closes that gap the
// cheapest way that's still correct: tell every other tab on the account
// which list might be stale, and let it re-run the same fetch it already
// uses on mount (see Frontend/src/hooks/useDataInvalidation.js) instead of
// trying to keep a pushed payload's shape in sync with the REST response's.
//
// `resource` matches the same vocabulary socketServer.js already uses for
// presence (RESOURCE_TYPE_TO_MODULE's keys): product, category, unit,
// customer, supplier, order, purchase.
export const emitAccountEvent = (accountId, resource, action = "changed") => {
    const io = getIO();
    if (!io || !accountId) return;
    io.to(accountRoom(accountId)).emit("data:changed", { resource, action, at: Date.now() });
};
