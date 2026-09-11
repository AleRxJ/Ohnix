import crypto from "crypto";
import { prisma } from "../db/prisma.js";
import { getRedisClient, isRedisConfigured } from "./redisClient.js";

// Multi-device sessions: one row per device (see UserSession in
// schema.prisma) instead of a single sid per user, so a shop owner's Desktop
// at the counter and phone in their pocket can both stay logged in at once -
// see docs/architecture/ohnix-multiplatform-strategy.md §29. Redis is kept
// only for the live-socket "kick this device now" pub/sub below (best-effort,
// fails open if unavailable, same as every other real-time feature here);
// the sessions themselves live in Postgres via Prisma, which is what
// isSessionValid/listSessions/revokeSession actually check.
export const SESSION_INVALIDATE_CHANNEL = "ohnix:session:invalidate";

export const generateSessionId = () => crypto.randomBytes(16).toString("hex");

const VALID_DEVICE_CLASSES = new Set(["web", "desktop", "mobile"]);

// The client tells us this directly (see Frontend/src/utils/platform.js,
// read via window.__TAURI_INTERNALS__/window.__OHNIX_MOBILE__ - Tauri's own
// IPC bridge global and a flag Mobile's WebView injects respectively)
// instead of this being sniffed from the User-Agent - a UA rewrite would
// risk tripping fraud heuristics on the payment gateway embedded in the app
// (epayco), for a signal that's display-only anyway. Anything unrecognized
// (including a plain web browser, which never sends this) defaults to
// "web". Never a security boundary: spoofing this only affects how your own
// device shows up in your own sessions list, not who can access it.
export const normalizeDeviceClass = (deviceClass) =>
    VALID_DEVICE_CLASSES.has(deviceClass) ? deviceClass : "web";

// Called on login, signup, and accept-invitation. `deviceId` is a UUID the
// client generates once and persists locally (see
// Frontend/src/utils/deviceId.js) so logging in again from the same
// browser/app updates this same row instead of appending a new "device"
// every time. Callers that don't have one yet (admin ending an
// impersonation session, the one-off audit script) fall back to a synthetic
// id scoped to this sid alone - that login just always shows as its own
// device in the list, which is correct for how rarely it happens.
export const registerSession = async (userId, sid, { deviceId, deviceClass, deviceInfo, refreshToken } = {}) => {
    const effectiveDeviceId = deviceId || `sid:${sid}`;
    const normalizedDeviceClass = normalizeDeviceClass(deviceClass);
    try {
        await prisma.userSession.upsert({
            where: { userId_deviceId: { userId, deviceId: effectiveDeviceId } },
            update: {
                sid,
                deviceClass: normalizedDeviceClass,
                deviceLabel: deviceInfo || null,
                refreshToken,
                lastSeenAt: new Date(),
            },
            create: {
                userId,
                deviceId: effectiveDeviceId,
                sid,
                deviceClass: normalizedDeviceClass,
                deviceLabel: deviceInfo || null,
                refreshToken,
            },
        });
    } catch (err) {
        console.error("[session] Failed to register session:", err?.message);
    }
};

// The row currently holding this sid, if any - refreshAccessToken
// (user.controller.js) uses this to compare the incoming refresh token
// against the one stored for this exact device before rotating it.
export const getSessionBySid = (sid) => prisma.userSession.findUnique({ where: { sid } });

// Refresh-token rotation reuses the same sid for the whole life of a device
// session (see user.controller.js's refreshAccessToken) - bump lastSeenAt
// and store the newly-rotated refresh token on whichever row already has it.
export const touchSession = async (sid, { refreshToken } = {}) => {
    try {
        await prisma.userSession.updateMany({
            where: { sid },
            data: { lastSeenAt: new Date(), ...(refreshToken ? { refreshToken } : {}) },
        });
    } catch (err) {
        console.error("[session] Failed to touch session:", err?.message);
    }
};

// Returns true when this sid is allowed to keep working. Fails open only on
// an unexpected DB error (matches the resilience posture of the rest of the
// app's request path) - a sid with no matching row is a real "this session
// was ended" case (logout/revoke), not treated as valid.
export const isSessionValid = async (userId, sid) => {
    if (!sid) return true;
    try {
        const session = await prisma.userSession.findUnique({ where: { sid } });
        return !!session && session.userId === userId;
    } catch (err) {
        console.error("[session] Failed to validate session:", err?.message);
        return true;
    }
};

export const listSessions = (userId) =>
    prisma.userSession.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" } });

const publishInvalidate = async (userId, sid, reason) => {
    if (!isRedisConfigured()) return;
    try {
        await getRedisClient().publish(
            SESSION_INVALIDATE_CHANNEL,
            JSON.stringify({ userId, sid, reason })
        );
    } catch (err) {
        console.error("[session] Failed to publish session invalidation:", err?.message);
    }
};

// Self-logout: drop only the caller's own device, quietly - see
// socketServer.js's reason handling for why "logout" never shows the
// "signed out elsewhere" toast the way "revoked"/"removed" do.
export const endSession = async (userId, sid) => {
    try {
        await prisma.userSession.deleteMany({ where: { userId, sid } });
    } catch (err) {
        console.error("[session] Failed to end session:", err?.message);
    }
    await publishInvalidate(userId, sid, "logout");
};

// Explicit revoke of one device from the user's own sessions list ("cerrar
// esta sesión" on something other than the device making the request).
// Ownership-checked: sessionId alone isn't enough to revoke someone else's.
export const revokeSession = async (userId, sessionId) => {
    let session;
    try {
        session = await prisma.userSession.findFirst({ where: { id: sessionId, userId } });
        if (!session) return false;
        await prisma.userSession.delete({ where: { id: session.id } });
    } catch (err) {
        console.error("[session] Failed to revoke session:", err?.message);
        return false;
    }
    await publishInvalidate(userId, session.sid, "revoked");
    return true;
};

// A team member was removed entirely (team.service.js) - force every device
// off at once instead of just whichever one happened to be active.
export const revokeAllSessions = async (userId) => {
    let sessions = [];
    try {
        sessions = await prisma.userSession.findMany({ where: { userId } });
        await prisma.userSession.deleteMany({ where: { userId } });
    } catch (err) {
        console.error("[session] Failed to revoke all sessions:", err?.message);
        return;
    }
    await Promise.all(sessions.map((session) => publishInvalidate(userId, session.sid, "removed")));
};
