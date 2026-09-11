import jwt from "jsonwebtoken";
import cookie from "cookie";
import { prisma } from "../db/prisma.js";
import { isSessionValid } from "../utils/sessionStore.js";
import { resolveAccountScope } from "../utils/teamContext.js";

// Mirrors verifyJWT (auth.middleware.js) for the WebSocket handshake: same
// token sources, same tokenVersion + per-device session checks, same account
// scope resolution - a socket connection should never be authorized under
// rules looser than the REST API.
export const authenticateSocket = async (socket) => {
    const cookieHeader = socket.handshake.headers?.cookie;
    const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};

    const token = socket.handshake.auth?.token || cookies.accessToken;

    if (!token) {
        throw new Error("No token provided");
    }

    let decodedToken;
    try {
        decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
        throw new Error(`Invalid access token: ${err.message}`);
    }

    const tokenUserId = decodedToken?._id;
    const user = await prisma.user.findFirst({
        where: { OR: [{ id: tokenUserId }, { legacyMongoId: tokenUserId }] },
        select: {
            id: true,
            legacyMongoId: true,
            username: true,
            avatar: true,
            tokenVersion: true,
        },
    });

    if (!user) {
        throw new Error("User not found");
    }

    if ((decodedToken.tokenVersion ?? 0) !== user.tokenVersion) {
        throw new Error("Access token has been revoked");
    }

    if (!(await isSessionValid(user.id, decodedToken.sid))) {
        throw new Error("Session ended - logged in on another device");
    }

    const accountScope = await resolveAccountScope(user.id);

    return {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        sid: decodedToken.sid,
        accountId: accountScope.accountId,
        actorId: accountScope.actorId,
        teamId: accountScope.teamId,
        teamRoleId: accountScope.teamRoleId,
        isTeamMember: accountScope.isTeamMember,
        isTeamOwner: accountScope.isTeamOwner,
        posScopeAll: accountScope.posScopeAll,
        posScopeIds: accountScope.posScopeIds,
    };
};
