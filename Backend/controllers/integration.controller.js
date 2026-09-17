import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { CONNECTOR_PROVIDERS } from "../connectors/registry.js";
import {
    mapConnection,
    createConnection,
    listConnections,
    findConnectionForAccount,
    testConnection as testConnectionService,
    registerWebhooks,
    publishProduct,
    syncInventory,
} from "../services/integration.service.js";

export const getProviders = asyncHandler(async (_req, res) => {
    return res.status(200).json(new ApiResponse(200, { providers: CONNECTOR_PROVIDERS }, "Available connector providers"));
});

export const getIntegrations = asyncHandler(async (req, res) => {
    const connections = await listConnections(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, connections.map(mapConnection), "Integrations fetched successfully"));
});

export const postIntegration = asyncHandler(async (req, res, next) => {
    const { provider, name, credentials, config } = req.body || {};
    if (!provider || !CONNECTOR_PROVIDERS.includes(provider)) {
        return next(new ApiError(400, `provider must be one of: ${CONNECTOR_PROVIDERS.join(", ")}`));
    }
    if (provider === "shopify" && (!config?.shopDomain || !credentials?.accessToken)) {
        return next(new ApiError(400, "config.shopDomain and credentials.accessToken are required for a Shopify connection"));
    }
    if (provider === "woocommerce" && (!config?.siteUrl || !credentials?.consumerKey || !credentials?.consumerSecret)) {
        return next(
            new ApiError(400, "config.siteUrl, credentials.consumerKey and credentials.consumerSecret are required for a WooCommerce connection")
        );
    }

    // WooCommerce lets the webhook creator choose the signing secret at
    // registration time (unlike Shopify, which verifies against a secret
    // that already exists on the merchant's app) - so Ohnix generates one
    // itself instead of asking the user to invent/find one.
    const resolvedCredentials =
        provider === "woocommerce" && !credentials?.webhookSecret
            ? { ...credentials, webhookSecret: `wc_whsec_${crypto.randomBytes(24).toString("hex")}` }
            : credentials;

    try {
        const connection = await createConnection(req.user.prismaId, { provider, name, credentials: resolvedCredentials, config });
        return res.status(201).json(new ApiResponse(201, mapConnection(connection), "Integration created. Test the connection to activate it."));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export const getIntegration = asyncHandler(async (req, res, next) => {
    try {
        const connection = await findConnectionForAccount(req.params.id, req.user.prismaId);
        return res.status(200).json(new ApiResponse(200, mapConnection(connection), "Integration fetched successfully"));
    } catch (error) {
        return next(error);
    }
});

export const postTestIntegration = asyncHandler(async (req, res, next) => {
    try {
        const result = await testConnectionService(req.params.id, req.user.prismaId);
        try {
            await registerWebhooks(req.params.id, req.user.prismaId);
        } catch (webhookError) {
            // The connection itself works (testConnection above succeeded) -
            // a webhook registration failure (e.g. PUBLIC_API_BASE_URL unset
            // in a local dev environment) shouldn't block "Probar conexión"
            // from reporting success, just surface it separately.
            return res.status(200).json(
                new ApiResponse(200, { ...result, webhooks_registered: false, webhook_error: webhookError.message }, "Connection works, but webhook registration failed")
            );
        }
        return res.status(200).json(new ApiResponse(200, { ...result, webhooks_registered: true }, "Connection successful"));
    } catch (error) {
        return next(error);
    }
});

export const deleteIntegration = asyncHandler(async (req, res, next) => {
    try {
        const connection = await findConnectionForAccount(req.params.id, req.user.prismaId);
        await prisma.integrationConnection.delete({ where: { id: connection.id } });
        return res.status(200).json(new ApiResponse(200, {}, "Integration disconnected successfully"));
    } catch (error) {
        return next(error);
    }
});

export const getIntegrationLogs = asyncHandler(async (req, res, next) => {
    try {
        const connection = await findConnectionForAccount(req.params.id, req.user.prismaId);
        const logs = await prisma.syncLog.findMany({
            where: { connectionId: connection.id },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        return res.status(200).json(
            new ApiResponse(
                200,
                logs.map((l) => ({
                    _id: l.id,
                    direction: l.direction,
                    entity_type: l.entityType,
                    action: l.action,
                    entity_id: l.entityId,
                    external_id: l.externalId,
                    status: l.status,
                    error_message: l.errorMessage,
                    created_at: l.createdAt,
                })),
                "Sync logs fetched successfully"
            )
        );
    } catch (error) {
        return next(error);
    }
});

export const postPublishProduct = asyncHandler(async (req, res, next) => {
    try {
        const result = await publishProduct(req.params.id, req.user.prismaId, req.params.productId);
        return res.status(200).json(new ApiResponse(200, result, "Product published successfully"));
    } catch (error) {
        return next(error);
    }
});

export const postSyncInventory = asyncHandler(async (req, res, next) => {
    const { product_id, variant_id } = req.body || {};
    if (!product_id) return next(new ApiError(400, "product_id is required"));

    try {
        const result = await syncInventory(req.params.id, req.user.prismaId, { productId: product_id, variantId: variant_id || null });
        return res.status(200).json(new ApiResponse(200, result, "Inventory synced successfully"));
    } catch (error) {
        return next(error);
    }
});
