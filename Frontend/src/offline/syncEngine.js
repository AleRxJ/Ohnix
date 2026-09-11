// Thin re-export shim over the shared sync engine (packages/sync-core),
// composed for this app in ./syncCore.js. All orchestration logic (pull all
// registered entities, drain the outbox, conflict/error classification, the
// subscribeSyncCompleted-not-subscribeConnectivity distinction) now lives
// there - see packages/sync-core/src/createSyncEngine.js. Kept as a
// separate file so every existing import path across the app
// (`../../offline/syncEngine`) keeps working unchanged.
import { syncCore } from "./syncCore.js";

export const { registerEntitySync, drainOutbox, runSync, startSyncEngine, subscribeSyncCompleted } =
    syncCore.syncEngine;

// Kept for API parity with the pre-extraction module - not currently
// imported anywhere (SyncStatusIndicator.jsx reads live counts straight off
// the Dexie `db.outbox` table instead, for reactivity - see its own
// comments), but cheap to preserve in case a future consumer wants a
// one-shot count without a live query.
export const { pendingOutboxCount, conflictOutboxCount } = syncCore.outbox;
