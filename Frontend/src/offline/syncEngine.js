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

// Populated by each module as it's wired for offline support (Etapa 1+).
// `pull(cursor)` fetches everything changed since `cursor` (an `updatedAt`
// ISO string, or null for a first full sync) and returns the new cursor to
// persist. Nothing is registered yet in Etapa 0 - the loop below is simply a
// no-op until then, which is intentional: there's no entity mirror to pull
// into yet.
const entitySyncHandlers = new Map();

export function registerEntitySync(entity, { pull }) {
    entitySyncHandlers.set(entity, { pull });
}

async function pullAllRegisteredEntities() {
    for (const [entity, handler] of entitySyncHandlers) {
        const cursorRow = await db.syncCursor.get(entity);
        const nextCursor = await handler.pull(cursorRow?.cursor ?? null);
        if (nextCursor) {
            await db.syncCursor.put({ entity, cursor: nextCursor, updatedAt: new Date().toISOString() });
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

async function replayOutboxEntry(entry) {
    await markSyncing(entry.localId);
    try {
        const response = await api.request({
            ...entry.request,
            headers: {
                ...(entry.request.headers || {}),
                "Idempotency-Key": entry.idempotencyKey,
            },
        });
        await markSynced(entry.localId, response?.data?.data?.id ?? null);
        return { ok: true };
    } catch (error) {
        if (isDeterministicRejection(error)) {
            await markConflict(entry.localId, error);
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

let syncing = false;
export async function runSync() {
    if (syncing || !getConnectivityState()) return;
    syncing = true;
    try {
        await pullAllRegisteredEntities();
        await drainOutbox();
    } finally {
        syncing = false;
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
