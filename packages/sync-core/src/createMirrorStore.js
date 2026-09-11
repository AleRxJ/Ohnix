// Storage-agnostic mirror (local cache) access. `storage` must implement the
// `mirror` half of the storage-adapter contract documented in README.md:
// { replaceAll(entity, records), upsert(entity, record), upsertMany(entity,
//   records), remove(entity, id), get(entity, id), readAll(entity) }
//
// 1:1 port of Frontend/src/offline/entityQueue.js's mirror* functions.
export function createMirrorStore(storage) {
    // Full-list overwrite, not a merge - correct because every pull here is a
    // full refetch of "everything this account/role can see" (none of these
    // endpoints paginate today), never a filtered/partial query. A filtered
    // search result must never be passed here (see readMirrorAll callers).
    function mirrorReplaceAll(entity, records) {
        return storage.replaceAll(entity, records);
    }

    function mirrorUpsert(entity, record) {
        return storage.upsert(entity, record);
    }

    // Write-through for a partial result set (e.g. one page of a paginated
    // list) - merges into whatever's already cached instead of replacing it,
    // unlike mirrorReplaceAll. Used where "everything" was never fetched in
    // the first place (Orders).
    function mirrorUpsertMany(entity, records) {
        return storage.upsertMany(entity, records);
    }

    function mirrorRemove(entity, id) {
        return storage.remove(entity, id);
    }

    // Rows queued for deletion stay in the mirror (see queueDelete) until the
    // server actually confirms it - excluded here by default so a delete
    // that's still only local disappears from the UI immediately, the same
    // way it would online, while still being recoverable if the server
    // rejects it.
    function mirrorGet(entity, id) {
        return storage.get(entity, id);
    }

    async function readMirrorAll(entity, { includePendingDelete = false } = {}) {
        const rows = await storage.readAll(entity);
        return includePendingDelete ? rows : rows.filter((row) => !row._pendingDelete);
    }

    return { mirrorReplaceAll, mirrorUpsert, mirrorUpsertMany, mirrorRemove, mirrorGet, readMirrorAll };
}
