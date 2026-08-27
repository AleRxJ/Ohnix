import crypto from "crypto";
import { prisma } from "../db/prisma.js";
import { signWebhookPayload } from "../utils/webhookSigning.js";

// Backoff schedule after each failed attempt (minutes) - attempt 1 fails ->
// retry in 1 min, attempt 2 fails -> 5 min, etc. Exhausting the list marks
// the delivery permanently "failed" (see sweepDueDeliveries below) instead
// of retrying forever.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 1440];
const DELIVERY_TIMEOUT_MS = 10_000;

const buildPayload = (eventType, data) => ({
    event: eventType,
    event_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    data,
});

// Fans one internal event out to every active WebhookEndpoint on the
// account subscribed to it, then attempts an immediate delivery for each -
// see docs/api/webhooks.md for the event catalog. Never throws; a failure
// to enqueue (e.g. no endpoints configured) is not the caller's problem, it
// just means nothing gets sent. Callers already treat this as
// fire-and-forget (`.catch(() => {})`), matching emitAccountEvent's own
// best-effort posture for the realtime socket layer.
export const enqueueWebhookEvent = async (accountId, eventType, data) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
        where: { accountId, isActive: true, events: { has: eventType } },
    });
    if (endpoints.length === 0) return [];

    const payload = buildPayload(eventType, data);

    const deliveries = await Promise.all(
        endpoints.map((endpoint) =>
            prisma.webhookDelivery.create({
                data: {
                    endpointId: endpoint.id,
                    eventType,
                    eventId: payload.event_id,
                    payload,
                },
            })
        )
    );

    deliveries.forEach((delivery, i) => attemptDelivery(delivery, endpoints[i]).catch(() => {}));
    return deliveries;
};

const attemptDelivery = async (delivery, endpoint) => {
    const body = JSON.stringify(delivery.payload);
    const signature = signWebhookPayload(endpoint.secret, body);
    const attempts = delivery.attempts + 1;

    let responseStatus = null;
    let lastError = null;
    let ok = false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
        try {
            const response = await fetch(endpoint.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Ohnix-Event": delivery.eventType,
                    "X-Ohnix-Event-Id": delivery.eventId,
                    "X-Ohnix-Signature": signature,
                },
                body,
                signal: controller.signal,
            });
            responseStatus = response.status;
            ok = response.ok;
            if (!ok) lastError = `HTTP ${response.status}`;
        } finally {
            clearTimeout(timeout);
        }
    } catch (error) {
        lastError = error.name === "AbortError" ? "Request timed out" : error.message;
    }

    if (ok) {
        await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { status: "success", attempts, responseStatus, lastError: null, deliveredAt: new Date(), nextAttemptAt: null },
        });
        return;
    }

    const backoffMinutes = BACKOFF_MINUTES[attempts - 1];
    const exhausted = backoffMinutes === undefined;

    await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
            status: exhausted ? "failed" : "pending",
            attempts,
            responseStatus,
            lastError,
            nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMinutes * 60_000),
        },
    });
};

// Called on a fixed interval (see webhookRetryScheduler.js) - picks up
// deliveries whose backoff window has elapsed and retries them. Bounded
// batch size so one sweep can't run unboundedly long against a large
// backlog.
export const sweepDueDeliveries = async (limit = 50) => {
    const due = await prisma.webhookDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: new Date() } },
        include: { endpoint: true },
        take: limit,
        orderBy: { nextAttemptAt: "asc" },
    });

    for (const delivery of due) {
        if (!delivery.endpoint.isActive) {
            await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "failed", nextAttemptAt: null } });
            continue;
        }
        await attemptDelivery(delivery, delivery.endpoint).catch(() => {});
    }

    return due.length;
};
