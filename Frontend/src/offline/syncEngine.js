import { api } from "../api/api.js";
import { db } from "./db.js";
import { getConnectivityState, subscribeConnectivity } from "./connectivity.js";
import {
    OUTBOX_STATUS,
    listPending,
    markSyncing,
    markSynced,
    markError,
    markConflict,
} from "./outbox.js";
import { MIRROR_ENTITIES } from "./db.js";
import { entriesToFormData, mirrorRemove, mirrorUpsert } from "./entityQueue.js";

// Populated by each module as it's wired for offline support - see
// entitySync.js (Etapa 1: Products/Categories/Units/Customers/Suppliers).
// `pull(cursor)` refreshes that entity's mirror and returns the new cursor
// to persist (today every registered pull is a full-list resync, so the
// cursor is nominal - see entitySync.js for why).
const entitySyncHandlers = new Map();

export function registerEntitySync(entity, { pull }) {
    entitySyncHandlers.set(entity, { pull });
}

async function pullAllRegisteredEntities() {
    for (const [entity, handler] of entitySyncHandlers) {
        try {
            const cursorRow = await db.syncCursor.get(entity);
            const nextCursor = await handler.pull(cursorRow?.cursor ?? null);
            if (nextCursor) {
                await db.syncCursor.put({ entity, cursor: nextCursor, updatedAt: new Date().toISOString() });
            }
        } catch (error) {
            // One entity's background refresh failing (a 500, a plan-gated
            // 403, a dropped connection mid-loop) must never block every
            // other entity's pull, and - critically - must never prevent
            // drainOutbox from running at all. Losing a queued sale because
            // an unrelated report endpoint hiccuped would be far worse than
            // this one mirror staying stale until the next sync.
            console.warn(`[sync] pull failed for "${entity}", continuing`, error);
        }
    }
}

// A rejection the server made deterministically about the operation itself -
// never worth repeating unchanged. Anything else (network drop, timeout,
// 5xx) is transient and stays eligible for automatic retry.
function isDeterministicRejection(error) {
    const status = error?.response?.status;
    return status !== undefined && status >= 400 && status < 500;
}

// Reflects a confirmed server response back onto the mirror table so a
// mutation made offline ends up looking exactly like one made online - the
// necessarily-partial optimistic create record is replaced by the real one
// (with its real id), and an update's optimistic merge is replaced by the
// authoritative version. Only applies to entities that actually have a
// mirror table (Etapa 1+ modules) - everything else's outbox entries just
// don't have a `db.table(entity)` to reconcile.
async function reconcileMirrorAfterSync(entry, serverRecord) {
    if (!MIRROR_ENTITIES.includes(entry.entity)) return;
    if (entry.opType === "create" && entry.localTempId) {
        await mirrorRemove(entry.entity, entry.localTempId);
    }
    if (serverRecord && (entry.opType === "create" || entry.opType === "update")) {
        await mirrorUpsert(entry.entity, serverRecord);
    }
    if (entry.opType === "delete" && entry.recordId) {
        await mirrorRemove(entry.entity, entry.recordId);
    }
}

// The server rejected the operation outright (stale-edit conflict, "has
// history", duplicate name, ...). A rejected delete's mirror row was only
// ever hidden (`_pendingDelete`, see queueDelete) - un-hide it, since the
// record genuinely still exists server-side and the UI must not keep
// pretending it's gone. Creates/updates need no such rollback: their
// optimistic record stays visible with `_pendingSync: true`, which is
// exactly what should happen - the user's input isn't lost, it's just
// flagged for them to fix and resubmit.
async function reconcileMirrorAfterConflict(entry) {
    if (!MIRROR_ENTITIES.includes(entry.entity)) return;
    if (entry.opType === "delete" && entry.recordId) {
        const existing = await db.table(entry.entity).get(entry.recordId);
        if (existing) await mirrorUpsert(entry.entity, { ...existing, _pendingDelete: false });
    }
}

async function replayOutboxEntry(entry) {
    await markSyncing(entry.localId);
    try {
        const request = { ...entry.request };
        if (request.isFormData) {
            request.data = entriesToFormData(request.data);
        }
        const response = await api.request({
            ...request,
            headers: {
                ...(entry.request.headers || {}),
                "Idempotency-Key": entry.idempotencyKey,
            },
        });
        const serverRecord = response?.data?.data ?? null;
        await reconcileMirrorAfterSync(entry, serverRecord);
        await markSynced(entry.localId, serverRecord?._id ?? null);
        return { ok: true };
    } catch (error) {
        if (isDeterministicRejection(error)) {
            await markConflict(entry.localId, error);
            await reconcileMirrorAfterConflict(entry);
            // Not a reason to stop draining the rest of the queue - this
            // specific operation is done (rejected), independent entries can
            // still succeed.
            return { ok: false, retryable: false };
        }
        await markError(entry.localId, error);
        // A network-level failure almost certainly means every subsequent
        // entry will fail the same way right now - stop and let the next
        // confirmed-online transition (or poll) resume the drain instead of
        // burning through every queued mutation on a connection that's
        // already gone.
        return { ok: false, retryable: true };
    }
}

let draining = false;
export async function drainOutbox() {
    if (draining) return;
    draining = true;
    try {
        const pending = await listPending();
        for (const entry of pending) {
            if (!getConnectivityState()) break;
            const result = await replayOutboxEntry(entry);
            if (!result.ok && result.retryable) break;
        }
    } finally {
        draining = false;
    }
}

// Fired once a full sync cycle (pull + drain) finishes - this is
// deliberately separate from "connectivity just came back" (subscribeConnectivity),
// which fires the instant the browser is confirmed online, before the
// outbox has actually drained. A module's hook refetching on that earlier
// signal alone raced the drain: it could refetch the still-stale server
// list, show that as final, and never look again even though the sync that
// would have added its own offline-created rows finished moments later.
// Refetching here instead means the UI only reloads once there's actually
// something new for it to see.
const syncCompletedListeners = new Set();
export function subscribeSyncCompleted(listener) {
    syncCompletedListeners.add(listener);
    return () => syncCompletedListeners.delete(listener);
}

let syncing = false;
export async function runSync() {
    if (syncing || !getConnectivityState()) return;
    syncing = true;
    try {
        await pullAllRegisteredEntities();
        await drainOutbox();
    } finally {
        syncing = false;
        for (const listener of syncCompletedListeners) listener();
    }
}

let started = false;
export function startSyncEngine() {
    if (started) return;
    started = true;
    subscribeConnectivity((online) => {
        if (online) runSync();
    });
    if (getConnectivityState()) runSync();
}

export async function pendingOutboxCount() {
    return db.outbox.where("status").anyOf(OUTBOX_STATUS.PENDING, OUTBOX_STATUS.ERROR, OUTBOX_STATUS.SYNCING).count();
}

export async function conflictOutboxCount() {
    return db.outbox.where("status").equals(OUTBOX_STATUS.CONFLICT).count();
}
