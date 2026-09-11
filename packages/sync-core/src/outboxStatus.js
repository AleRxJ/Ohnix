// Outbox entry statuses. A rejection the server made deterministically
// (stale-edit conflict, insufficient stock, a duplicate name) is CONFLICT,
// never retried automatically - only the user acting on it (edit and
// resubmit, or discard) moves it out of that state. A transient failure
// (dropped connection mid-request, 5xx) is ERROR and is retried with
// backoff by the sync engine.
export const OUTBOX_STATUS = {
    PENDING: "PENDING",
    SYNCING: "SYNCING",
    SYNCED: "SYNCED",
    ERROR: "ERROR",
    CONFLICT: "CONFLICT",
};
