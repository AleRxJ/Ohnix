import { db } from "./db.js";

// Implements @ohnix/sync-core's storage-adapter contract (see
// packages/sync-core/README.md) against the existing Dexie instance. This is
// the ONLY file where the sync engine's logic touches Dexie directly - every
// call here is the exact same `db.*` call outbox.js/entityQueue.js/
// syncEngine.js used to make before this extraction, just relocated. A
// future Tauri (tauri-plugin-sql) or Expo (expo-sqlite) adapter implements
// this same shape against SQL tables instead.
export const dexieAdapter = {
    outbox: {
        add: (entry) => db.outbox.add(entry),
        get: (localId) => db.outbox.get(localId),
        update: (localId, patch) => db.outbox.update(localId, patch),
        remove: (localId) => db.outbox.delete(localId),
        listByStatus: (statuses) => db.outbox.where("status").anyOf(statuses).sortBy("createdAt"),
        countByStatus: (statuses) => db.outbox.where("status").anyOf(statuses).count(),
    },
    mirror: {
        replaceAll: (entity, records) => {
            const table = db.table(entity);
            return db.transaction("rw", table, async () => {
                await table.clear();
                await table.bulkPut(records);
            });
        },
        upsert: (entity, record) => db.table(entity).put(record),
        upsertMany: (entity, records) => db.table(entity).bulkPut(records),
        remove: (entity, id) => db.table(entity).delete(id),
        get: (entity, id) => db.table(entity).get(id),
        readAll: (entity) => db.table(entity).toArray(),
    },
    cursor: {
        get: (entity) => db.syncCursor.get(entity),
        put: (entity, cursor, updatedAt) => db.syncCursor.put({ entity, cursor, updatedAt }),
    },
};
