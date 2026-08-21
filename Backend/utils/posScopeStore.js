import { getRedisClient } from "./redisClient.js";

// live/socketServer.js subscribes to this so an already-connected socket
// whose Point of Sale room membership just became stale gets a fresh start
// instead of silently keeping rooms that no longer match its actual access.
// Two cases publish here: a new PointOfSale was created (full-scope sockets
// need to join it - see pointOfSale.service.js#createPointOfSale), or one
// specific member's scope was changed (team.service.js#changeMemberScope).
// Forcing a full reconnect (rather than diffing which rooms to leave/join)
// is deliberate - the architecture audit called this out as the simpler,
// safer option, and it's the same technique SESSION_INVALIDATE_CHANNEL
// already uses for a session takeover (see sessionStore.js): reconnecting
// re-runs authenticateSocket, which re-resolves scope fresh from the
// database.
export const POS_SCOPE_INVALIDATE_CHANNEL = "ohnix:pos-scope:invalidate";

// `userId` omitted = every connected socket for this account should
// reconsider (a new PointOfSale was created - only matters to full-scope
// sockets, but the subscriber can tell those apart locally without another
// round trip). `userId` given = only that one member's sockets are stale.
export const publishPosScopeChange = async ({ accountId, userId }) => {
    const redis = getRedisClient();
    if (!redis) return;
    try {
        await redis.publish(POS_SCOPE_INVALIDATE_CHANNEL, JSON.stringify({ accountId, userId: userId ?? null }));
    } catch (err) {
        console.error("[live] Failed to publish pos-scope invalidation:", err?.message);
    }
};
