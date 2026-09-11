import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { isSessionValid } from "../utils/sessionStore.js";
import { isImpersonationSessionValid } from "../utils/impersonationSession.js";
import { resolveAccountScope } from "../utils/teamContext.js";

const shouldLogAuthDebug =
    process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        // Check multiple sources for token
        let token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "") ||
            req.body?.accessToken ||
            req.query?.accessToken;

        if (shouldLogAuthDebug) {
            console.log("Token sources:", {
                cookies: !!req.cookies?.accessToken,
                authorization: !!req.header("Authorization"),
                body: !!req.body?.accessToken,
                query: !!req.query?.accessToken,
                foundToken: !!token,
            });
        }

        if (!token) {
            return next(
                new ApiError(401, "Unauthorized request - No token provided")
            );
        }

        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        } catch (jwtError) {
            console.error("JWT verification failed:", jwtError.message);
            return next(
                new ApiError(401, `Invalid Access Token: ${jwtError.message}`)
            );
        }

        const tokenUserId = decodedToken?._id;

        const user = await prisma.user.findFirst({
            where: {
                OR: [{ id: tokenUserId }, { legacyMongoId: tokenUserId }],
            },
            select: {
                id: true,
                legacyMongoId: true,
                username: true,
                email: true,
                role: true,
                avatar: true,
                isVerified: true,
                preferredLanguage: true,
                createdAt: true,
                updatedAt: true,
                tokenVersion: true,
            },
        });

        if (!user) {
            return next(
                new ApiError(401, "Invalid Access Token - User not found")
            );
        }

        // Tokens minted before this field existed have no tokenVersion claim
        // - treat that as 0 (the default every user starts at) so existing
        // sessions keep working until their next password change, instead of
        // mass-logging-out everyone the moment this deploys. A password
        // change/reset bumps User.tokenVersion, which immediately makes every
        // access token issued before that point - old or new format - fail
        // this check, revoking them across every device at once.
        if ((decodedToken.tokenVersion ?? 0) !== user.tokenVersion) {
            return next(
                new ApiError(401, "Access token has been revoked - please log in again")
            );
        }

        // Multi-device sessions: each login/device has its own row (see
        // UserSession in schema.prisma) - explicitly logging out or revoking
        // a device from the sessions list deletes its row, which makes this
        // check fail on that device's very next request instead of waiting
        // for its token to expire naturally. Other devices' sids are
        // untouched, unlike the old single-active-session model.
        //
        // An impersonation token (minted by impersonateUser, never by
        // issueAuthTokens) never touches this user's real UserSession rows -
        // checking it here would either reject every impersonation token
        // outright (no matching sid) or, worse, require overwriting the
        // target's real session to make it pass. It's validated against its
        // own independent Redis namespace instead - see
        // impersonationSession.js.
        if (decodedToken.impersonatedBy) {
            if (!(await isImpersonationSessionValid(decodedToken.sid))) {
                return next(
                    new ApiError(401, "La sesión simulada terminó o expiró")
                );
            }
        } else if (!(await isSessionValid(user.id, decodedToken.sid))) {
            return next(
                new ApiError(
                    401,
                    "Session ended - you logged in on another device"
                )
            );
        }

        const accountScope = await resolveAccountScope(user.id);

        req.user = {
            ...user,
            _id: user.legacyMongoId || user.id,
            // prismaId stays the resource-scoping id (createdById everywhere
            // else in the app): the team owner's id for an active team
            // member, or the user's own id otherwise - see teamContext.js.
            prismaId: accountScope.accountId,
            actorId: accountScope.actorId,
            teamId: accountScope.teamId,
            teamRoleId: accountScope.teamRoleId,
            isTeamMember: accountScope.isTeamMember,
            isTeamOwner: accountScope.isTeamOwner,
            // Which of this account's Points of Sale the actor may act on -
            // see pos.permissions.js. posScopeAll: true means "all,
            // including ones created later"; posScopeIds is only meaningful
            // when posScopeAll is false.
            posScopeAll: accountScope.posScopeAll,
            posScopeIds: accountScope.posScopeIds,
            // Present only when this request is running as an admin's
            // impersonation of this user (see impersonateUser/endImpersonation
            // in user.controller.js) - role/scope above already reflect the
            // impersonated user, not the admin, so isAdmin-gated routes stay
            // correctly blocked during impersonation with no extra check.
            impersonatedBy: decodedToken.impersonatedBy || null,
            impersonatedByUsername: decodedToken.impersonatedByUsername || null,
            impersonationSid: decodedToken.impersonatedBy ? decodedToken.sid : null,
            // This device's own session row id (see UserSession) - logout
            // uses it to end just this device, and the sessions-list
            // endpoint uses it to mark which row is "this device" in the UI.
            sid: decodedToken.sid || null,
        };
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return next(
            new ApiError(401, error?.message || "Invalid access token")
        );
    }
});
