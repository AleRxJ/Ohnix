import { db } from "./db.js";
import { enqueueOperation } from "./outbox.js";

// FormData isn't structured-cloneable as-is, but its entries (strings and
// File/Blob objects) are - IndexedDB stores File/Blob natively. Serializing
// to a plain [key, value][] array here (instead of storing the FormData
// object itself) is what lets an offline-queued multipart mutation - e.g.
// editing a product with a new photo attached - survive a reload and still
// replay correctly once the connection comes back.
export function formDataToEntries(formData) {
    return Array.from(formData.entries());
}

export function entriesToFormData(entries) {
    const formData = new FormData();
    for (const [key, value] of entries) formData.append(key, value);
    return formData;
}

function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
}

// Full-list overwrite, not a merge - correct because every pull here is a
// full refetch of "everything this account/role can see" (none of these 5
// endpoints paginate today), never a filtered/partial query. A filtered
// search result must never be passed here (see readMirrorAll callers).
export async function mirrorReplaceAll(entity, records) {
    const table = db.table(entity);
    await db.transaction("rw", table, async () => {
        await table.clear();
        await table.bulkPut(records);
    });
}

export async function mirrorUpsert(entity, record) {
    await db.table(entity).put(record);
}

// Write-through for a partial result set (e.g. one page of a paginated
// list) - merges into whatever's already cached instead of replacing it,
// unlike mirrorReplaceAll. Used where "everything" was never fetched in the
// first place (Orders - see db.js's comment on why it isn't a full mirror).
export async function mirrorUpsertMany(entity, records) {
    await db.table(entity).bulkPut(records);
}

export async function mirrorRemove(entity, id) {
    await db.table(entity).delete(id);
}

// Rows queued for deletion stay in the mirror (see queueDelete) until the
// server actually confirms it - excluded here by default so a delete that's
// still only local disappears from the UI immediately, the same way it would
// online, while still being recoverable if the server rejects it.
export async function mirrorGet(entity, id) {
    return db.table(entity).get(id);
}

export async function readMirrorAll(entity, { includePendingDelete = false } = {}) {
    const rows = await db.table(entity).toArray();
    return includePendingDelete ? rows : rows.filter((row) => !row._pendingDelete);
}

// Queues an offline create and reflects it in the mirror immediately so the
// UI shows it right away. `fields` is either a plain object or a FormData -
// detected automatically. The optimistic record is necessarily partial (it's
// exactly what the user typed, not what the server would compute/attach -
// e.g. no `created_by` display name yet) - `_pendingSync: true` is how the UI
// tells a still-queued row apart from a confirmed one.
export async function queueCreate({ entity, url, fields, meta = {}, optimisticExtra = {} }) {
    const asFormData = isFormData(fields);
    const plainFields = asFormData ? Object.fromEntries(formDataToEntries(fields)) : fields;
    const tempId = `offline-${crypto.randomUUID()}`;
    // optimisticExtra is display-only (e.g. a synthesized `created_by` so the
    // UI's existing render code doesn't have to special-case a field the
    // real API response always includes but a bare create request never
    // submits) - it's never part of what actually gets sent to the server.
    const optimisticRecord = { ...plainFields, ...optimisticExtra, _id: tempId, _pendingSync: true };
    await mirrorUpsert(entity, optimisticRecord);
    await enqueueOperation({
        entity,
        opType: "create",
        request: {
            method: "post",
            url,
            data: asFormData ? formDataToEntries(fields) : fields,
            isFormData: asFormData,
        },
        meta: { ...meta, localTempId: tempId },
    });
    return optimisticRecord;
}

// Queues an offline update, merged onto whatever the mirror already has for
// this record (itself a full copy of the last-synced server response) - so
// display-only nested fields (category name, created_by, ...) the edit form
// itself never touches are preserved instead of disappearing until the next
// sync, unlike a fresh create's necessarily-partial optimistic record.
// `optimisticPatch` overrides what gets merged into the mirror when the
// request body itself isn't a partial record - e.g. adjust-stock's
// {delta, reason} has nothing in common with a product's own fields, so the
// display-side effect (stock changes by `delta`) has to be computed and
// passed in separately from what's actually sent to the server.
export async function queueUpdate({ entity, url, id, fields, optimisticPatch, method = "patch", meta = {} }) {
    const asFormData = isFormData(fields);
    const plainFields = asFormData ? Object.fromEntries(formDataToEntries(fields)) : fields;
    const existing = await db.table(entity).get(id);
    const optimisticRecord = {
        ...(existing || {}),
        ...(optimisticPatch ?? plainFields),
        _id: id,
        _pendingSync: true,
    };
    await mirrorUpsert(entity, optimisticRecord);
    await enqueueOperation({
        entity,
        opType: "update",
        request: {
            method,
            url,
            data: asFormData ? formDataToEntries(fields) : fields,
            isFormData: asFormData,
        },
        meta,
    });
    return optimisticRecord;
}

// Doesn't hard-delete the mirror row - the server can still reject this
// (e.g. `product_has_history`), and by then there'd be nothing left to
// restore. Flagging it `_pendingDelete` hides it from readMirrorAll's normal
// result immediately (looks deleted to the UI) while keeping the data around
// for the sync engine to either finish removing (confirmed) or un-hide
// (rejected) - see reconcileMirrorAfterSync/reconcileMirrorAfterConflict in
// syncEngine.js.
export async function queueDelete({ entity, url, id, meta = {} }) {
    const existing = await db.table(entity).get(id);
    if (existing) {
        await mirrorUpsert(entity, { ...existing, _pendingDelete: true });
    }
    await enqueueOperation({
        entity,
        opType: "delete",
        request: { method: "delete", url },
        meta: { ...meta, recordId: id },
    });
}
