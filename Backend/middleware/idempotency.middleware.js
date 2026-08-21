import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// How long a "processing" row is trusted before we assume the original
// request died mid-flight (crash, deploy, timeout) without ever reaching
// res.json - past this window a retry is allowed to reclaim the key instead
// of being blocked forever by an attempt that will never resolve.
const STALE_PROCESSING_MS = 2 * 60 * 1000;

// Wraps a mutating route so a client-supplied `Idempotency-Key` header makes
// a retry (network timeout, a double-click that slips in before the button
// disables, an automatic axios retry) replay the first response instead of
// re-running the operation a second time. This is the gap the atomic-claim
// UPDATE pattern used across product/purchase/order stock writes does NOT
// cover: that pattern only stops two *different* concurrent operations from
// double-spending the same stock, not the same operation from being applied
// twice in sequence.
//
// `scope` namespaces the key per-route (so the same raw key sent to two
// different endpoints never collides) and every key is additionally scoped
// to the caller's account (`req.user.prismaId`) via the DB unique
// constraint. Silently skipped when no header is sent, so this is additive
// protection - no client is required to adopt it to keep working.
export const idempotent = (scope) =>
    asyncHandler(async (req, res, next) => {
        const key = req.header("Idempotency-Key");
        const accountId = req.user?.prismaId;
        if (!key || !String(key).trim() || !accountId) return next();

        const trimmedKey = String(key).trim().slice(0, 200);
        const where = { accountId_scope_key: { accountId, scope, key: trimmedKey } };

        let record;
        try {
            record = await prisma.idempotencyKey.create({
                data: { accountId, scope, key: trimmedKey, status: "processing" },
            });
        } catch (error) {
            if (error.code !== "P2002") throw error;

            const existing = await prisma.idempotencyKey.findUnique({ where });
            if (!existing) return next(); // lost the race to read it back - just proceed

            if (existing.status === "completed") {
                return res.status(existing.responseStatus).json(existing.responseBody);
            }

            const isStale = Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS;
            if (!isStale) {
                return next(
                    new ApiError(409, "This request is already being processed. Please wait a moment and check before retrying.")
                );
            }

            // A previous attempt started and never finished - reclaim the row
            // rather than blocking this (very likely genuine) retry forever.
            record = await prisma.idempotencyKey.update({
                where: { id: existing.id },
                data: { status: "processing" },
            });
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
            prisma.idempotencyKey
                .update({
                    where: { id: record.id },
                    data: {
                        status: "completed",
                        responseStatus: res.statusCode,
                        responseBody: JSON.parse(JSON.stringify(body)),
                    },
                })
                .catch((err) => console.error("Failed to persist idempotency record:", err));
            return originalJson(body);
        };

        next();
    });
