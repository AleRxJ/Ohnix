import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../offline/db.js";
import { OUTBOX_STATUS } from "../offline/outbox.js";
import { resolveRecordLabel } from "../offline/describeOutboxEntry.js";

const MAX_ROWS = 5;
// "Enviado" rows stay visible this long after syncing, so coming back online
// shows each change actually landing instead of the list just vanishing.
const RECENT_SYNCED_MS = 10 * 60 * 1000;
const STATUS_ORDER = { [OUTBOX_STATUS.SYNCING]: 0, [OUTBOX_STATUS.ERROR]: 1, [OUTBOX_STATUS.PENDING]: 2 };

const isRecent = (entry) => entry.lastAttemptAt && Date.now() - Date.parse(entry.lastAttemptAt) <= RECENT_SYNCED_MS;

// Live view of the outbox for the sync popover: what's waiting, what's being
// sent right now, what's retrying, and what just landed.
const useSyncQueue = () =>
    useLiveQuery(
        async () => {
            const active = await db.outbox
                .where("status")
                .anyOf(OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR)
                .toArray();
            active.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || String(a.createdAt).localeCompare(String(b.createdAt)));
            // SYNCED rows are never pruned from the outbox, so only walk the
            // newest ones (highest localId first) instead of the whole table.
            const synced = db.outbox.where("status").equals(OUTBOX_STATUS.SYNCED);
            const recentCount = await synced.clone().filter(isRecent).count();
            const recent = await synced.reverse().filter(isRecent).limit(3).toArray();

            const rows = [...active, ...recent].slice(0, MAX_ROWS);
            const labels = await Promise.all(rows.map(resolveRecordLabel));
            return {
                rows: rows.map((entry, index) => ({ ...entry, recordLabel: labels[index] })),
                activeCount: active.length,
                syncingCount: active.filter((entry) => entry.status === OUTBOX_STATUS.SYNCING).length,
                errorCount: active.filter((entry) => entry.status === OUTBOX_STATUS.ERROR).length,
                recentCount,
                hiddenCount: Math.max(0, active.length + recent.length - MAX_ROWS),
            };
        },
        [],
        null
    );

export default useSyncQueue;
