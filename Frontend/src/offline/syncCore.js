// Composition root: wires the shared, storage-agnostic sync engine
// (packages/sync-core) to this app's Dexie adapter, its axios instance, and
// its connectivity detector. outbox.js/entityQueue.js/syncEngine.js are now
// thin re-export shims over this single instance - see their file comments.
//
// Imported by relative path, not as an npm dependency: Vercel's production
// install command for this app is `npm install --prefix Frontend`, and
// plain npm does not understand pnpm's `workspace:*` protocol. Adding
// "@ohnix/sync-core": "workspace:*" to Frontend/package.json would break
// that install. A relative import has no such dependency - it works
// identically whether or not pnpm workspace linking is even present. See
// docs/architecture/ohnix-multiplatform-strategy.md §10/§25 (Fase A).
import { createSyncCore } from "../../../packages/sync-core/src/index.js";
import { dexieAdapter } from "./dexieAdapter.js";
import { api } from "../api/api.js";
import { getConnectivityState, subscribeConnectivity } from "./connectivity.js";
import { MIRROR_ENTITIES } from "./db.js";

export const syncCore = createSyncCore({
    storage: dexieAdapter,
    httpClient: api,
    connectivity: { getConnectivityState, subscribeConnectivity },
    mirrorEntities: MIRROR_ENTITIES,
});
