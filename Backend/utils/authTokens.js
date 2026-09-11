import jwt from "jsonwebtoken";
import { ApiError } from "./ApiError.js";
import { prisma } from "../db/prisma.js";
import { generateSessionId, registerSession, touchSession } from "./sessionStore.js";

// Shared by user.controller.js (login/refresh) and team.controller.js
// (invitation acceptance auto-login) so both mint tokens the exact same way -
// including the sid/session-tracking behavior in sessionStore.js.

export const DEFAULT_ACCESS_TOKEN_EXPIRY = "1d";
export const DEFAULT_REFRESH_TOKEN_EXPIRY = "10d";

export const normalizeJwtExpiry = (value, fallback) => {
    const normalized = value?.trim().replace(/^['"]|['"]$/g, "");

    if (!normalized) {
        return fallback;
    }

    if (/^\d+$/.test(normalized) || /^\d+[smhdwy]$/.test(normalized)) {
        return normalized;
    }

    console.warn(
        `Invalid JWT expiry value "${value}". Falling back to "${fallback}".`
    );
    return fallback;
};

export const userForTokenSelect = {
    id: true,
    legacyMongoId: true,
    username: true,
    email: true,
    tokenVersion: true,
};

export const userLookupByTokenId = (tokenUserId) => ({
    OR: [{ id: tokenUserId }, { legacyMongoId: tokenUserId }],
});

// sid (session id) is embedded in both tokens and mirrored in Postgres (see
// sessionStore.js): a fresh call (no sid passed - login/signup/accept-
// invitation) mints a new one and registers it as its own device row,
// alongside any other device already logged in; passing an existing sid
// (token refresh) carries it forward and just touches that same row's
// lastSeenAt instead of registering a new device.
export const issueAuthTokens = async (userId, { sid, deviceId, deviceClass, deviceInfo } = {}) => {
    try {
        if (!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
            throw new Error("JWT secrets are not configured");
        }

        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(userId),
            select: userForTokenSelect,
        });

        if (!user) {
            throw new Error("User not found while generating auth tokens");
        }

        const tokenUserId = user.legacyMongoId || user.id;
        const isRefresh = Boolean(sid);
        const effectiveSid = sid || generateSessionId();

        const accessToken = jwt.sign(
            {
                _id: tokenUserId,
                email: user.email,
                username: user.username,
                tokenVersion: user.tokenVersion,
                sid: effectiveSid,
            },
            process.env.ACCESS_TOKEN_SECRET,
            {
                expiresIn: normalizeJwtExpiry(
                    process.env.ACCESS_TOKEN_EXPIRY,
                    DEFAULT_ACCESS_TOKEN_EXPIRY
                ),
            }
        );

        const refreshToken = jwt.sign(
            {
                _id: tokenUserId,
                sid: effectiveSid,
            },
            process.env.REFRESH_TOKEN_SECRET,
            {
                expiresIn: normalizeJwtExpiry(
                    process.env.REFRESH_TOKEN_EXPIRY,
                    DEFAULT_REFRESH_TOKEN_EXPIRY
                ),
            }
        );

        if (isRefresh) {
            await touchSession(effectiveSid, { refreshToken });
        } else {
            await registerSession(user.id, effectiveSid, { deviceId, deviceClass, deviceInfo, refreshToken });
        }

        return { accessToken, refreshToken, sid: effectiveSid };
    } catch (error) {
        console.error("Token generation failed:", error);
        throw new ApiError(
            500,
            error?.message ||
                "Something went wrong while generating referesh and access token"
        );
    }
};

export const AUTH_COOKIE_OPTIONS = {
    access: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
    },
    refresh: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
    },
};
