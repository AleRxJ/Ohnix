import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";

// Event catalog Ohnix can push to a registered WebhookEndpoint - see
// docs/api/webhooks.md. Kept here (not utils/apiScopes.js) since it's a
// list of events, not permissions - a key still needs webhooks:write to
// manage endpoints regardless of which events it subscribes to.
export const WEBHOOK_EVENTS = [
    "product.created",
    "product.updated",
    "inventory.updated",
    "order.created",
    "order.updated",
    "order.cancelled",
    "order.refunded",
];

const MAX_ENDPOINTS = 10;

const mapEndpoint = (endpoint) => ({
    _id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    is_active: endpoint.isActive,
    // The signing secret is shown once, at creation, same rule as the API
    // key itself - after that only a masked hint (never usable to forge a
    // signature) so it can still be told apart in a list.
    secret_hint: `${endpoint.secret.slice(0, 6)}…`,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
});

const validateEvents = (events) => {
    if (!Array.isArray(events) || events.length === 0) {
        throw new ApiError(400, `events must be a non-empty array. Valid events: ${WEBHOOK_EVENTS.join(", ")}`);
    }
    const unique = [...new Set(events)];
    const invalid = unique.filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (invalid.length > 0) {
        throw new ApiError(400, `Unknown event(s): ${invalid.join(", ")}. Valid events: ${WEBHOOK_EVENTS.join(", ")}`);
    }
    return unique;
};

const validateUrl = (url) => {
    if (!url || typeof url !== "string") throw new ApiError(400, "url is required");
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new ApiError(400, "url must be a valid URL");
    }
    if (parsed.protocol !== "https:") {
        throw new ApiError(400, "url must use https");
    }
    return parsed.toString();
};

export const listWebhookEndpoints = asyncHandler(async (req, res) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
        where: { accountId: req.user.prismaId },
        orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(new ApiResponse(200, endpoints.map(mapEndpoint), "Webhook endpoints fetched successfully"));
});

export const getWebhookEvents = asyncHandler(async (_req, res) => {
    return res.status(200).json(new ApiResponse(200, { events: WEBHOOK_EVENTS }, "Available webhook events"));
});

export const createWebhookEndpoint = asyncHandler(async (req, res, next) => {
    let url;
    let events;
    try {
        url = validateUrl(req.body?.url);
        events = validateEvents(req.body?.events);
    } catch (error) {
        return next(error);
    }

    const count = await prisma.webhookEndpoint.count({ where: { accountId: req.user.prismaId } });
    if (count >= MAX_ENDPOINTS) {
        return next(new ApiError(403, `You can register at most ${MAX_ENDPOINTS} webhook endpoints.`));
    }

    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    const endpoint = await prisma.webhookEndpoint.create({
        data: { accountId: req.user.prismaId, url, events, secret },
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                { ...mapEndpoint(endpoint), secret },
                "Webhook endpoint created successfully. Store the secret securely - it will not be shown again."
            )
        );
});

export const updateWebhookEndpoint = asyncHandler(async (req, res, next) => {
    const existing = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.id, accountId: req.user.prismaId },
    });
    if (!existing) return next(new ApiError(404, "Webhook endpoint not found"));

    const data = {};
    try {
        if (req.body?.url !== undefined) data.url = validateUrl(req.body.url);
        if (req.body?.events !== undefined) data.events = validateEvents(req.body.events);
    } catch (error) {
        return next(error);
    }
    if (req.body?.is_active !== undefined) data.isActive = req.body.is_active === true;

    const endpoint = await prisma.webhookEndpoint.update({ where: { id: existing.id }, data });
    return res.status(200).json(new ApiResponse(200, mapEndpoint(endpoint), "Webhook endpoint updated successfully"));
});

export const deleteWebhookEndpoint = asyncHandler(async (req, res, next) => {
    const existing = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.id, accountId: req.user.prismaId },
    });
    if (!existing) return next(new ApiError(404, "Webhook endpoint not found"));

    await prisma.webhookEndpoint.delete({ where: { id: existing.id } });
    return res.status(200).json(new ApiResponse(200, {}, "Webhook endpoint deleted successfully"));
});

// Recent delivery attempts for one endpoint - what the admin monitoring
// panel / dashboard integrations page reads to answer "did my webhook
// actually fire".
export const getWebhookDeliveries = asyncHandler(async (req, res, next) => {
    const existing = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.id, accountId: req.user.prismaId },
    });
    if (!existing) return next(new ApiError(404, "Webhook endpoint not found"));

    const deliveries = await prisma.webhookDelivery.findMany({
        where: { endpointId: existing.id },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            deliveries.map((d) => ({
                _id: d.id,
                event_type: d.eventType,
                event_id: d.eventId,
                status: d.status,
                attempts: d.attempts,
                response_status: d.responseStatus,
                last_error: d.lastError,
                delivered_at: d.deliveredAt,
                created_at: d.createdAt,
            })),
            "Webhook deliveries fetched successfully"
        )
    );
});
