import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { generateApiKey } from "../utils/apiKey.js";
import { API_SCOPES, FULL_ACCESS_SCOPES, isValidScope } from "../utils/apiScopes.js";

const MAX_ACTIVE_KEYS = 5;

const mapApiKey = (apiKey) => ({
    id: apiKey.id,
    name: apiKey.name,
    key_prefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    requests_today: apiKey.requestsToday,
    requests_reset_at: apiKey.requestsResetAt,
    last_used_at: apiKey.lastUsedAt,
    revoked_at: apiKey.revokedAt,
    created_at: apiKey.createdAt,
});

// Validates a caller-supplied scopes array, or returns the full-access
// default when the field is omitted entirely - see FULL_ACCESS_SCOPES's
// comment for why "not specified" defaults to everything rather than
// nothing (keeps the pre-scopes behavior for anyone who doesn't opt into
// narrower access).
const resolveScopes = (rawScopes) => {
    if (rawScopes === undefined) return FULL_ACCESS_SCOPES;
    if (!Array.isArray(rawScopes)) {
        throw new ApiError(400, "scopes must be an array of scope strings");
    }
    const unique = [...new Set(rawScopes)];
    const invalid = unique.filter((s) => !isValidScope(s));
    if (invalid.length > 0) {
        throw new ApiError(400, `Unknown scope(s): ${invalid.join(", ")}. Valid scopes: ${API_SCOPES.join(", ")}`);
    }
    return unique;
};

export const listApiKeys = asyncHandler(async (req, res) => {
    const apiKeys = await prisma.apiKey.findMany({
        where: { userId: req.user.prismaId },
        orderBy: { createdAt: "desc" },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, apiKeys.map(mapApiKey), "API keys fetched successfully"));
});

export const getAvailableScopes = asyncHandler(async (_req, res) => {
    return res.status(200).json(new ApiResponse(200, { scopes: API_SCOPES }, "Available scopes"));
});

export const createApiKey = asyncHandler(async (req, res, next) => {
    const { name, scopes } = req.body;
    if (!name || !String(name).trim()) {
        return next(new ApiError(400, "A name is required for the API key"));
    }

    let resolvedScopes;
    try {
        resolvedScopes = resolveScopes(scopes);
    } catch (error) {
        return next(error);
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
            scopes: resolvedScopes,
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

// Lets the owner narrow or widen an existing key's access without having to
// revoke it and hand out a brand-new secret to whatever already integrated
// it - see the e-commerce integration design's "Scopes/permisos" section.
export const updateApiKeyScopes = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    let resolvedScopes;
    try {
        resolvedScopes = resolveScopes(req.body?.scopes);
    } catch (error) {
        return next(error);
    }
    if (req.body?.scopes === undefined) {
        return next(new ApiError(400, "scopes is required"));
    }

    const existing = await prisma.apiKey.findFirst({
        where: { id, userId: req.user.prismaId },
    });
    if (!existing) {
        return next(new ApiError(404, "API key not found"));
    }
    if (existing.revokedAt) {
        return next(new ApiError(400, "This API key is revoked and can't be modified"));
    }

    const apiKey = await prisma.apiKey.update({
        where: { id },
        data: { scopes: resolvedScopes },
    });

    return res.status(200).json(new ApiResponse(200, mapApiKey(apiKey), "Scopes updated successfully"));
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
