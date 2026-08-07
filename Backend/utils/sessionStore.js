import crypto from "crypto";
import { getRedisClient } from "./redisClient.js";

// Single active session per user (rule: no two tabs/devices with a "live"
// session at once). One Redis key holds the currently-valid session id (sid);
// logging in anywhere overwrites it, which instantly invalidates every token
// minted before that point the next time it's checked (see requireActiveSession
// in auth.middleware.js) - no need to track/revoke old sids individually.
const sessionKey = (userId) => `session:active:${userId}`;

// live/socketServer.js subscribes to this so an already-connected WebSocket
// (an open tab on another device) is told to disconnect immediately instead
// of only finding out on its next REST call - see also isSessionValid below,
// which is what actually enforces this for REST.
export const SESSION_INVALIDATE_CHANNEL = "ohnix:session:invalidate";

const ttlSecondsFromExpiry = (expiryString, fallbackSeconds) => {
    const match = `${expiryString || ""}`.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return fallbackSeconds;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] || 1;
    return value * multiplier;
};

export const generateSessionId = () => crypto.randomBytes(16).toString("hex");

// Called on login and on refresh-token rotation. Overwrites whatever session
// was previously active for this user, anywhere.
export const setActiveSession = async (userId, sid, { deviceInfo } = {}) => {
    const redis = getRedisClient();
    if (!redis) return;

    const ttlSeconds = ttlSecondsFromExpiry(
        process.env.REFRESH_TOKEN_EXPIRY,
        7 * 24 * 60 * 60
    );

    try {
        await redis.set(
            sessionKey(userId),
            JSON.stringify({
                sid,
                deviceInfo: deviceInfo || null,
                issuedAt: new Date().toISOString(),
            }),
            "EX",
            ttlSeconds
        );
        await redis.publish(SESSION_INVALIDATE_CHANNEL, JSON.stringify({ userId, sid }));
    } catch (err) {
        console.error("[session] Failed to set active session:", err?.message);
    }
};

export const getActiveSession = async (userId) => {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
        const raw = await redis.get(sessionKey(userId));
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.error("[session] Failed to read active session:", err?.message);
        return null;
    }
};

export const clearActiveSession = async (userId) => {
    const redis = getRedisClient();
    if (!redis) return;

    try {
        await redis.del(sessionKey(userId));
        // sid: null - any connected socket (its sid is always a real value)
        // no longer matches, so the subscriber in socketServer.js drops all
        // of this user's live connections on explicit logout too.
        await redis.publish(SESSION_INVALIDATE_CHANNEL, JSON.stringify({ userId, sid: null }));
    } catch (err) {
        console.error("[session] Failed to clear active session:", err?.message);
    }
};

// Returns true when the given sid is allowed to keep working: either Redis is
// unavailable (fail-open, see redisClient.js) or it matches the currently
// active session, or there simply is no active session recorded yet (tokens
// minted before this feature shipped - treat like tokenVersion's rollout).
export const isSessionValid = async (userId, sid) => {
    const redis = getRedisClient();
    if (!redis) return true;
    if (!sid) return true;

    const active = await getActiveSession(userId);
    if (!active) return true;

    return active.sid === sid;
};
