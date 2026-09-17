import { db } from "./db.js";

// Outbox entry statuses. A rejection the server made deterministically
// (stale-edit conflict, insufficient stock, a duplicate name) is CONFLICT,
// never retried automatically - only the user acting on it (edit and
// resubmit, or discard) moves it out of that state. A transient failure
// (dropped connection mid-request, 5xx) is ERROR and is retried with
// backoff by the sync engine.
export const OUTBOX_STATUS = {
    PENDING: "PENDING",
    SYNCING: "SYNCING",
    SYNCED: "SYNCED",
    ERROR: "ERROR",
    CONFLICT: "CONFLICT",
};

// Queues one mutation for later replay. `request` describes exactly how to
// replay it against the same REST API the app already calls online -
// {method, url, data, params?}. The Idempotency-Key is generated once, here,
// and reused on every retry, so a retried request can never be double
// applied server-side (Backend/middleware/idempotency.middleware.js is the
// other half of this contract).
export async function enqueueOperation({ entity, opType, request, meta = {} }) {
    const localId = await db.outbox.add({
        entity,
        opType,
        request,
        idempotencyKey: crypto.randomUUID(),
        ...meta,
        status: OUTBOX_STATUS.PENDING,
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
        remoteId: null,
        createdAt: new Date().toISOString(),
    });
    return db.outbox.get(localId);
}

export function listByStatus(status) {
    return db.outbox.where("status").equals(status).sortBy("createdAt");
}

export function listPending() {
    return db.outbox
        .where("status")
        .anyOf(OUTBOX_STATUS.PENDING, OUTBOX_STATUS.ERROR)
        .sortBy("createdAt");
}

export function countByStatus(status) {
    return db.outbox.where("status").equals(status).count();
}

export function markSyncing(localId) {
    return db.outbox.update(localId, { status: OUTBOX_STATUS.SYNCING });
}

export function markSynced(localId, remoteId = null) {
    return db.outbox.update(localId, {
        status: OUTBOX_STATUS.SYNCED,
        remoteId,
        lastAttemptAt: new Date().toISOString(),
    });
}

// The server's own JSON error body (e.g. "Ya existe una categoría con este
// nombre", "Stock insuficiente") is far more useful to whoever eventually has
// to resolve a CONFLICT than axios's own generic `error.message` ("Request
// failed with status code 409") - fall back to that (and then to a plain
// String() coercion) only when there's no real response body to read.
function describeError(error) {
    return error?.response?.data?.message || error?.message || String(error);
}

// Backend/utils/ApiError.js's `code` - a stable, machine-readable id (e.g.
// "category_already_exists", "insufficient_stock") the frontend can map to
// a translated string, unlike `message`, which is only ever an English
// dev-facing fallback. Not every ApiError sets one yet, so this is often
// null - ConflictsPanel.jsx falls back to the raw message in that case.
function describeErrorCode(error) {
    return error?.response?.data?.code || null;
}

// Transient failure - eligible for another automatic retry.
export async function markError(localId, error) {
    const attempts = await nextAttemptCount(localId);
    return db.outbox.update(localId, {
        status: OUTBOX_STATUS.ERROR,
        attempts,
        lastError: describeError(error),
        lastErrorCode: describeErrorCode(error),
        lastAttemptAt: new Date().toISOString(),
    });
}

// Deterministic server rejection - never auto-retried, surfaced for the
// user to resolve.
export function markConflict(localId, error) {
    return db.outbox.update(localId, {
        status: OUTBOX_STATUS.CONFLICT,
        lastError: describeError(error),
        lastErrorCode: describeErrorCode(error),
        lastAttemptAt: new Date().toISOString(),
    });
}

async function nextAttemptCount(localId) {
    const entry = await db.outbox.get(localId);
    return (entry?.attempts ?? 0) + 1;
}

export function removeEntry(localId) {
    return db.outbox.delete(localId);
}

export async function hasPendingWork() {
    const count = await db.outbox
        .where("status")
        .anyOf(OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR, OUTBOX_STATUS.CONFLICT)
        .count();
    return count > 0;
}
