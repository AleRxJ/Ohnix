// Thin re-export shim over the shared sync engine (packages/sync-core),
// composed for this app in ./syncCore.js. All logic (idempotency-key
// generation, status transitions) now lives there - see
// packages/sync-core/src/createOutboxStore.js. Kept as a separate file
// (rather than inlining these into syncCore.js) so every existing import
// path across the app (`../../offline/outbox`) keeps working unchanged.
export { OUTBOX_STATUS } from "../../../packages/sync-core/src/index.js";
import { syncCore } from "./syncCore.js";

export const {
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
} = syncCore.outbox;
