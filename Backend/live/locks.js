import { getRedisClient } from "../utils/redisClient.js";

// Soft-lock: presence + "someone else is editing this" rather than real
// concurrency control (CRDT/OT) - the agreed v1 scope (see team.service.js
// comments / conversation). One resource can be "locked" for editing by one
// user at a time; anyone else gets told who holds it and can't acquire it
// until they release, heartbeat-timeout, or disconnect.
const LOCK_TTL_SECONDS = 5 * 60;
// Suggested client heartbeat cadence - well under LOCK_TTL_SECONDS so a
// couple of missed beats (flaky connection) don't drop the lock.
export const LOCK_HEARTBEAT_INTERVAL_MS = 30 * 1000;

const lockKey = (accountId, resourceType, resourceId) =>
    `lock:resource:${accountId}:${resourceType}:${resourceId}`;

const readLock = async (redis, key) => {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
};

export const acquireLock = async ({ accountId, resourceType, resourceId, holder }) => {
    const redis = getRedisClient();
    if (!redis) {
        // No Redis configured - fail open (no lock enforcement), same
        // tradeoff as sessionStore.js.
        return { acquired: true, holder };
    }

    const key = lockKey(accountId, resourceType, resourceId);
    const existing = await readLock(redis, key);

    if (existing && existing.userId !== holder.userId) {
        return { acquired: false, holder: existing };
    }

    await redis.set(key, JSON.stringify({ ...holder, acquiredAt: new Date().toISOString() }), "EX", LOCK_TTL_SECONDS);
    return { acquired: true, holder };
};

export const refreshLock = async ({ accountId, resourceType, resourceId, userId }) => {
    const redis = getRedisClient();
    if (!redis) return true;

    const key = lockKey(accountId, resourceType, resourceId);
    const existing = await readLock(redis, key);
    if (!existing || existing.userId !== userId) return false;

    await redis.expire(key, LOCK_TTL_SECONDS);
    return true;
};

export const releaseLock = async ({ accountId, resourceType, resourceId, userId }) => {
    const redis = getRedisClient();
    if (!redis) return true;

    const key = lockKey(accountId, resourceType, resourceId);
    const existing = await readLock(redis, key);
    if (!existing || existing.userId !== userId) return false;

    await redis.del(key);
    return true;
};

export const getLock = async ({ accountId, resourceType, resourceId }) => {
    const redis = getRedisClient();
    if (!redis) return null;
    return readLock(redis, lockKey(accountId, resourceType, resourceId));
};
