import { createOutboxStore } from "./createOutboxStore.js";
import { createMirrorStore } from "./createMirrorStore.js";
import { createEntityQueue } from "./createEntityQueue.js";
import { createSyncEngine } from "./createSyncEngine.js";

// Convenience factory wiring an outbox store, a mirror store, the entity
// queue, and the sync engine together from one storage adapter - this is
// the single entry point a platform's composition root (e.g.
// Frontend/src/offline/syncCore.js) is expected to call.
//
// storage must implement the full contract in README.md:
//   { outbox: {...}, mirror: {...}, cursor: {...} }
// httpClient must expose .request(config) -> Promise<{data}> (an axios
// instance satisfies this directly).
// connectivity must expose { getConnectivityState(), subscribeConnectivity(listener) }.
// mirrorEntities is the array of entity names that have a mirror table.
export function createSyncCore({ storage, httpClient, connectivity, mirrorEntities }) {
    const outboxStore = createOutboxStore(storage.outbox);
    const mirrorStore = createMirrorStore(storage.mirror);
    const entityQueue = createEntityQueue({ outboxStore, mirrorStore, mirrorEntities });
    const syncEngine = createSyncEngine({
        outboxStore,
        mirrorStore,
        cursorStore: storage.cursor,
        httpClient,
        connectivity,
        mirrorEntities,
    });

    return { outbox: outboxStore, mirror: mirrorStore, entityQueue, syncEngine };
}
