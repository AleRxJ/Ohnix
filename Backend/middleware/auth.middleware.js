import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { isSessionValid } from "../utils/sessionStore.js";
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

        // Single active session: a login on another device/tab mints a new
        // sid and overwrites Redis's record of the active one for this user
        // - once that happens, this (now-superseded) token stops working
        // immediately instead of waiting for its natural expiry.
        if (!(await isSessionValid(user.id, decodedToken.sid))) {
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
        };
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return next(
            new ApiError(401, error?.message || "Invalid access token")
        );
    }
});
