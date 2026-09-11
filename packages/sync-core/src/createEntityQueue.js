import { formDataToEntries, isFormData } from "./formData.js";

// Combines an outbox store and a mirror store into the queueCreate/
// queueUpdate/queueDelete helpers every offline-enabled module uses. 1:1
// port of Frontend/src/offline/entityQueue.js's queue* functions.
export function createEntityQueue({ outboxStore, mirrorStore, mirrorEntities }) {
    // Queues an offline create and reflects it in the mirror immediately so
    // the UI shows it right away. `fields` is either a plain object or a
    // FormData - detected automatically. The optimistic record is
    // necessarily partial (it's exactly what the user typed, not what the
    // server would compute/attach - e.g. no `created_by` display name yet) -
    // `_pendingSync: true` is how the UI tells a still-queued row apart from
    // a confirmed one.
    async function queueCreate({ entity, url, fields, meta = {}, optimisticExtra = {} }) {
        const asFormData = isFormData(fields);
        const plainFields = asFormData ? Object.fromEntries(formDataToEntries(fields)) : fields;
        const tempId = `offline-${crypto.randomUUID()}`;
        // optimisticExtra is display-only (e.g. a synthesized `created_by` so
        // the UI's existing render code doesn't have to special-case a field
        // the real API response always includes but a bare create request
        // never submits) - it's never part of what actually gets sent to the
        // server.
        const optimisticRecord = { ...plainFields, ...optimisticExtra, _id: tempId, _pendingSync: true };
        await mirrorStore.mirrorUpsert(entity, optimisticRecord);
        await outboxStore.enqueueOperation({
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

    // Queues an offline update, merged onto whatever the mirror already has
    // for this record (itself a full copy of the last-synced server
    // response) - so display-only nested fields (category name, created_by,
    // ...) the edit form itself never touches are preserved instead of
    // disappearing until the next sync, unlike a fresh create's necessarily-
    // partial optimistic record. `optimisticPatch` overrides what gets merged
    // into the mirror when the request body itself isn't a partial record -
    // e.g. adjust-stock's {delta, reason} has nothing in common with a
    // product's own fields, so the display-side effect (stock changes by
    // `delta`) has to be computed and passed in separately from what's
    // actually sent to the server.
    async function queueUpdate({ entity, url, id, fields, optimisticPatch, method = "patch", meta = {} }) {
        const asFormData = isFormData(fields);
        const plainFields = asFormData ? Object.fromEntries(formDataToEntries(fields)) : fields;
        const existing = await mirrorStore.mirrorGet(entity, id);
        const optimisticRecord = {
            ...(existing || {}),
            ...(optimisticPatch ?? plainFields),
            _id: id,
            _pendingSync: true,
        };
        await mirrorStore.mirrorUpsert(entity, optimisticRecord);
        await outboxStore.enqueueOperation({
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
    // restore. Flagging it `_pendingDelete` hides it from readMirrorAll's
    // normal result immediately (looks deleted to the UI) while keeping the
    // data around for the sync engine to either finish removing (confirmed)
    // or un-hide (rejected).
    async function queueDelete({ entity, url, id, meta = {} }) {
        const existing = await mirrorStore.mirrorGet(entity, id);
        if (existing) {
            await mirrorStore.mirrorUpsert(entity, { ...existing, _pendingDelete: true });
        }
        await outboxStore.enqueueOperation({
            entity,
            opType: "delete",
            request: { method: "delete", url },
            meta: { ...meta, recordId: id },
        });
    }

    // Called when the user chooses to give up on a CONFLICT entry rather than
    // fix and resubmit it (see createOutboxStore.js's OUTBOX_STATUS.CONFLICT
    // comment - a conflict never clears on its own). A rejected create's
    // optimistic record was never real (the server never accepted it) -
    // remove it from the mirror too, instead of leaving a fake
    // `_pendingSync` row behind forever. An update/delete's mirror row is
    // left alone: reconcileMirrorAfterConflict (createSyncEngine.js) already
    // un-hid a rejected delete, and the next full resync naturally
    // overwrites any stale optimistic update with the server's real record -
    // there's no "previous state" saved to restore to here.
    async function discardConflict(entry) {
        if (entry.opType === "create" && entry.localTempId && mirrorEntities.includes(entry.entity)) {
            await mirrorStore.mirrorRemove(entry.entity, entry.localTempId);
        }
        await outboxStore.removeEntry(entry.localId);
    }

    return { queueCreate, queueUpdate, queueDelete, discardConflict };
}
