import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";

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
            },
        });

        if (!user) {
            return next(
                new ApiError(401, "Invalid Access Token - User not found")
            );
        }

        req.user = {
            ...user,
            _id: user.legacyMongoId || user.id,
            prismaId: user.id,
        };
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return next(
            new ApiError(401, error?.message || "Invalid access token")
        );
    }
});
