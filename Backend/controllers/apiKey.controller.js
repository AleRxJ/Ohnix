import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { generateApiKey } from "../utils/apiKey.js";

const MAX_ACTIVE_KEYS = 5;

const mapApiKey = (apiKey) => ({
    id: apiKey.id,
    name: apiKey.name,
    key_prefix: apiKey.keyPrefix,
    requests_today: apiKey.requestsToday,
    requests_reset_at: apiKey.requestsResetAt,
    last_used_at: apiKey.lastUsedAt,
    revoked_at: apiKey.revokedAt,
    created_at: apiKey.createdAt,
});

export const listApiKeys = asyncHandler(async (req, res) => {
    const apiKeys = await prisma.apiKey.findMany({
        where: { userId: req.user.prismaId },
        orderBy: { createdAt: "desc" },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, apiKeys.map(mapApiKey), "API keys fetched successfully"));
});

export const createApiKey = asyncHandler(async (req, res, next) => {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return next(new ApiError(400, "A name is required for the API key"));
    }

    const activeCount = await prisma.apiKey.count({
        where: { userId: req.user.prismaId, revokedAt: null },
    });
    if (activeCount >= MAX_ACTIVE_KEYS) {
        return next(
            new ApiError(
                403,
                `You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one before creating another.`
            )
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { companyId: true },
    });

    const { fullKey, keyPrefix, keyHash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
        data: {
            userId: req.user.prismaId,
            companyId: user?.companyId ?? null,
            name: String(name).trim(),
            keyPrefix,
            keyHash,
        },
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                { ...mapApiKey(apiKey), key: fullKey },
                "API key created successfully. Store it securely - it will not be shown again."
            )
        );
});

export const revokeApiKey = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const existing = await prisma.apiKey.findFirst({
        where: { id, userId: req.user.prismaId },
    });
    if (!existing) {
        return next(new ApiError(404, "API key not found"));
    }
    if (existing.revokedAt) {
        return next(new ApiError(400, "This API key is already revoked"));
    }

    const apiKey = await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
    });

    return res.status(200).json(new ApiResponse(200, mapApiKey(apiKey), "API key revoked successfully"));
});
