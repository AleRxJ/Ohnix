import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getRedisClient } from "./redisClient.js";

// Impersonation gets its own token-minting path instead of reusing
// issueAuthTokens (authTokens.js): that helper overwrites the target user's
// stored refreshToken and their single-active-session sid in Redis
// (sessionStore.js), which would silently end their real session the moment
// an admin starts impersonating them. This mints a short-lived,
// non-refreshable access token instead, and tracks its validity in a Redis
// namespace ("impersonation:sid:*") completely separate from
// "session:active:<userId>" - starting or ending an impersonation never
// touches the target's real session.
export const IMPERSONATION_TOKEN_EXPIRY = "20m";
const IMPERSONATION_TTL_SECONDS = 20 * 60;

const impersonationKey = (sid) => `impersonation:sid:${sid}`;

export const signImpersonationToken = (targetUser, adminId, adminUsername) => {
    const sid = crypto.randomUUID();
    const accessToken = jwt.sign(
        {
            _id: targetUser.legacyMongoId || targetUser.id,
            email: targetUser.email,
            username: targetUser.username,
            tokenVersion: targetUser.tokenVersion,
            sid,
            impersonatedBy: adminId,
            impersonatedByUsername: adminUsername,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: IMPERSONATION_TOKEN_EXPIRY }
    );
    return { accessToken, sid };
};

export const setImpersonationSession = async (sid, { adminId, targetUserId }) => {
    const redis = getRedisClient();
    if (!redis) return;

    try {
        await redis.set(
            impersonationKey(sid),
            JSON.stringify({ adminId, targetUserId, issuedAt: new Date().toISOString() }),
            "EX",
            IMPERSONATION_TTL_SECONDS
        );
    } catch (err) {
        console.error("[impersonation] Failed to set session:", err?.message);
    }
};

// Fails open when Redis is unavailable, same policy as isSessionValid
// (sessionStore.js) - a Redis outage degrades this extra check rather than
// blocking every impersonation session, consistent with how the rest of the
// app treats Redis as best-effort infrastructure.
export const isImpersonationSessionValid = async (sid) => {
    const redis = getRedisClient();
    if (!redis) return true;
    if (!sid) return false;

    try {
        const raw = await redis.get(impersonationKey(sid));
        return Boolean(raw);
    } catch (err) {
        console.error("[impersonation] Failed to read session:", err?.message);
        return true;
    }
};

export const clearImpersonationSession = async (sid) => {
    const redis = getRedisClient();
    if (!redis || !sid) return;

    try {
        await redis.del(impersonationKey(sid));
    } catch (err) {
        console.error("[impersonation] Failed to clear session:", err?.message);
    }
};
