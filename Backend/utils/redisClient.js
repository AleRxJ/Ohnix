import Redis from "ioredis";

// Single-session enforcement (see auth.middleware.js / user.controller.js) and
// live-presence (see live/presence.js, phase 2) both live in Redis rather than
// Postgres - they are ephemeral, high-write, and don't need transactional
// guarantees or migration history.
//
// Fails open on purpose: if Redis is unreachable, auth still works (session
// checks are skipped with a warning) rather than taking the whole API down
// over a best-effort feature. This is a deliberate tradeoff - a Redis outage
// temporarily disables single-session enforcement instead of disabling login.
let client = null;
let hasWarnedMissingUrl = false;

export const getRedisClient = () => {
    if (client) return client;

    const url = process.env.REDIS_URL;
    if (!url) {
        if (!hasWarnedMissingUrl) {
            console.warn(
                "[redis] REDIS_URL not configured - single-session enforcement and live presence are disabled."
            );
            hasWarnedMissingUrl = true;
        }
        return null;
    }

    client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on("error", (err) => {
        console.error("[redis] Connection error:", err?.message);
    });

    return client;
};

export const isRedisConfigured = () => Boolean(process.env.REDIS_URL);
