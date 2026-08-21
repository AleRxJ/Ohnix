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

// Tracked so a health check (see app.js's `/`) can surface "Redis is down"
// to something a human might actually look at - before this, an outage only
// ever produced console.error spam on every failed command, which nobody
// was watching. `lastError`/`downSince` are for that same reason: not used
// to change behavior (this still fails open everywhere), only to make the
// degraded state observable.
let connectionState = "unconfigured"; // unconfigured | connecting | ready | down
let lastError = null;
let downSince = null;

const setState = (next, err = null) => {
    if (next === connectionState) return;
    const previous = connectionState;
    connectionState = next;
    if (next === "down") {
        downSince = downSince || new Date();
        lastError = err?.message || lastError;
        console.error(
            `[redis] state ${previous} -> down - single-session enforcement, presence and edit-locks are degraded until it recovers.`,
            err?.message
        );
    } else if (next === "ready") {
        if (previous === "down") {
            console.warn(`[redis] recovered - was down since ${downSince?.toISOString()}`);
        }
        downSince = null;
    }
};

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

    connectionState = "connecting";
    client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on("error", (err) => {
        lastError = err?.message;
        setState("down", err);
    });
    client.on("ready", () => setState("ready"));
    client.on("close", () => setState("down"));

    return client;
};

export const isRedisConfigured = () => Boolean(process.env.REDIS_URL);

// Cheap, synchronous status snapshot - no round-trip to Redis itself, just
// the connection state ioredis has already told us about.
export const getRedisHealth = () => ({
    configured: isRedisConfigured(),
    state: connectionState,
    downSince: downSince ? downSince.toISOString() : null,
    lastError,
});
