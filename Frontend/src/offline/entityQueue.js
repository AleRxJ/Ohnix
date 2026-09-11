// Thin re-export shim over the shared sync engine (packages/sync-core),
// composed for this app in ./syncCore.js. All logic (optimistic mirror
// records, FormData handling) now lives there - see
// packages/sync-core/src/createMirrorStore.js and createEntityQueue.js.
// Kept as a separate file so every existing import path across the app
// (`../../offline/entityQueue`) keeps working unchanged.
export { formDataToEntries, entriesToFormData } from "../../../packages/sync-core/src/index.js";
import { syncCore } from "./syncCore.js";

export const { mirrorReplaceAll, mirrorUpsert, mirrorUpsertMany, mirrorRemove, mirrorGet, readMirrorAll } =
    syncCore.mirror;

export const { queueCreate, queueUpdate, queueDelete, discardConflict } = syncCore.entityQueue;
