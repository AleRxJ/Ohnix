import { OUTBOX_STATUS } from "./outboxStatus.js";

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

// Storage-agnostic outbox state machine. `storage` must implement the
// `outbox` half of the storage-adapter contract documented in README.md:
// { add(entry) -> localId, get(localId), update(localId, patch),
//   remove(localId), listByStatus(statuses[]), countByStatus(statuses[]) }
//
// This is a 1:1 port of Frontend/src/offline/outbox.js's logic - the only
// change is that every direct `db.outbox.*` call becomes a call to the
// injected `storage` adapter, so the same logic can run against Dexie today
// and a SQLite adapter (Tauri/Expo) later without being rewritten.
export function createOutboxStore(storage) {
    // Queues one mutation for later replay. `request` describes exactly how
    // to replay it against the same REST API the app already calls online -
    // {method, url, data, params?}. The Idempotency-Key is generated once,
    // here, and reused on every retry, so a retried request can never be
    // double applied server-side (Backend/middleware/idempotency.middleware.js
    // is the other half of this contract).
    async function enqueueOperation({ entity, opType, request, meta = {} }) {
        const localId = await storage.add({
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
        return storage.get(localId);
    }

    function listByStatus(status) {
        return storage.listByStatus([status]);
    }

    function listPending() {
        return storage.listByStatus([OUTBOX_STATUS.PENDING, OUTBOX_STATUS.ERROR]);
    }

    function countByStatus(status) {
        return storage.countByStatus([status]);
    }

    function markSyncing(localId) {
        return storage.update(localId, { status: OUTBOX_STATUS.SYNCING });
    }

    function markSynced(localId, remoteId = null) {
        return storage.update(localId, {
            status: OUTBOX_STATUS.SYNCED,
            remoteId,
            lastAttemptAt: new Date().toISOString(),
        });
    }

    // Transient failure - eligible for another automatic retry.
    async function markError(localId, error) {
        const entry = await storage.get(localId);
        const attempts = (entry?.attempts ?? 0) + 1;
        return storage.update(localId, {
            status: OUTBOX_STATUS.ERROR,
            attempts,
            lastError: describeError(error),
            lastErrorCode: describeErrorCode(error),
            lastAttemptAt: new Date().toISOString(),
        });
    }

    // Deterministic server rejection - never auto-retried, surfaced for the
    // user to resolve.
    function markConflict(localId, error) {
        return storage.update(localId, {
            status: OUTBOX_STATUS.CONFLICT,
            lastError: describeError(error),
            lastErrorCode: describeErrorCode(error),
            lastAttemptAt: new Date().toISOString(),
        });
    }

    function removeEntry(localId) {
        return storage.remove(localId);
    }

    async function hasPendingWork() {
        const count = await storage.countByStatus([
            OUTBOX_STATUS.PENDING,
            OUTBOX_STATUS.SYNCING,
            OUTBOX_STATUS.ERROR,
            OUTBOX_STATUS.CONFLICT,
        ]);
        return count > 0;
    }

    async function pendingOutboxCount() {
        return storage.countByStatus([OUTBOX_STATUS.PENDING, OUTBOX_STATUS.ERROR, OUTBOX_STATUS.SYNCING]);
    }

    async function conflictOutboxCount() {
        return storage.countByStatus([OUTBOX_STATUS.CONFLICT]);
    }

    return {
        enqueueOperation,
        listByStatus,
        listPending,
        countByStatus,
        markSyncing,
        markSynced,
        markError,
        markConflict,
        removeEntry,
        hasPendingWork,
        pendingOutboxCount,
        conflictOutboxCount,
    };
}
