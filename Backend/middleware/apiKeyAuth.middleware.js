import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../db/prisma.js";
import { hashApiKey } from "../utils/apiKey.js";
import {
    ensureUserSubscription,
    getEffectivePlan,
    getPlanFeatures,
    ensureActiveSubscription,
} from "./pricing.middleware.js";

const DAILY_REQUEST_LIMIT = 1000;

const extractApiKey = (req) => {
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }
    const apiKeyHeader = req.header("X-API-Key");
    return apiKeyHeader ? apiKeyHeader.trim() : null;
};

export const verifyApiKey = asyncHandler(async (req, _res, next) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
        return next(
            new ApiError(
                401,
                "Missing API key. Send it as 'Authorization: Bearer <key>' or an 'X-API-Key' header."
            )
        );
    }

    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(rawKey) },
        include: {
            user: {
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
            },
        },
    });

    if (!apiKey || apiKey.revokedAt) {
        return next(new ApiError(401, "Invalid or revoked API key"));
    }

    const subscription = await ensureUserSubscription(apiKey.userId);
    ensureActiveSubscription(subscription);

    const effectivePlan = getEffectivePlan(subscription);
    if (!getPlanFeatures(effectivePlan).apiAccess) {
        return next(
            new ApiError(
                403,
                "The public API is not available on your current plan. Upgrade to Escala or Enterprise to get an API key."
            )
        );
    }

    req.apiKey = apiKey;
    req.apiKeyPlan = effectivePlan;
    req.user = {
        ...apiKey.user,
        _id: apiKey.user.legacyMongoId || apiKey.user.id,
        prismaId: apiKey.user.id,
        // API keys are owner-only (see teamGuard.middleware.js#blockTeamMembers -
        // a team member can never mint one), so the caller is always the
        // account owner here, which is always full-scope - same rule as
        // pos.permissions.js/teamContext.js apply everywhere else.
        posScopeAll: true,
        posScopeIds: null,
    };
    next();
});

// Enterprise gets unrestricted API rate limits per plan promise; every other
// plan with apiAccess (currently just Escala) is capped at 1,000 req/day.
export const enforceApiRateLimit = asyncHandler(async (req, _res, next) => {
    const { apiKey } = req;
    const now = new Date();

    if (req.apiKeyPlan === "enterprise") {
        await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { lastUsedAt: now },
        });
        return next();
    }

    const isNewDay = now.toDateString() !== new Date(apiKey.requestsResetAt).toDateString();

    if (isNewDay) {
        await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { requestsToday: 1, requestsResetAt: now, lastUsedAt: now },
        });
        return next();
    }

    if (apiKey.requestsToday >= DAILY_REQUEST_LIMIT) {
        return next(
            new ApiError(
                429,
                `Daily API rate limit reached (${DAILY_REQUEST_LIMIT} requests/day). Try again tomorrow or upgrade to Enterprise for unlimited requests.`
            )
        );
    }

    await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { requestsToday: { increment: 1 }, lastUsedAt: now },
    });
    next();
});
