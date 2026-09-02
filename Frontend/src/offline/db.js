import Dexie from "dexie";

// Local, transactional store for offline-first support. Kept deliberately
// separate from Cache Storage (which the service worker uses for the static
// app shell) - this database is exclusively for business data and the
// mutation queue, never for JS/CSS/HTML assets.
//
// Schema starts minimal (outbox + sync bookkeeping only). Per-entity mirror
// tables (products, customers, orders, ...) are added with their own Dexie
// version bump as each module is wired for offline support, instead of
// declaring tables no code reads or writes yet.
export const db = new Dexie("ohnix-offline");

db.version(1).stores({
    // Mutation queue. `status` is indexed so the sync engine and the status
    // indicator can both query pending/error/conflict counts without a full
    // table scan. `entity` is indexed for per-module draining/inspection.
    outbox: "++localId, status, entity, createdAt",

    // Per-entity incremental-pull bookmark: { entity, cursor, updatedAt }.
    // `entity` is the primary key - one row per synced entity.
    syncCursor: "entity",

    // Small key/value table for offline bookkeeping that isn't an entity or
    // an outbox entry - notably which account this device's local data
    // currently belongs to, so a different account logging in on the same
    // browser never sees a previous account's cached rows (see
    // resetIfAccountChanged below).
    meta: "key",
});

const CURRENT_ACCOUNT_KEY = "currentAccountId";

// Every offline table other than the two account-scoping columns below gets
// wiped here, so this needs to be extended (not duplicated) as entity tables
// are added in later stages.
async function clearAllOfflineData() {
    await db.transaction("rw", db.outbox, db.syncCursor, async () => {
        await db.outbox.clear();
        await db.syncCursor.clear();
    });
}

// Called once auth state is known (login success, or app boot with a
// restored session). If the account using this browser/device changed since
// the last time Ohnix ran here, wipe local data first - offline rows and
// queued mutations must never leak across accounts sharing a device.
export async function resetOfflineDataIfAccountChanged(accountId) {
    if (!accountId) return;
    const stored = await db.meta.get(CURRENT_ACCOUNT_KEY);
    if (stored && stored.value !== accountId) {
        await clearAllOfflineData();
    }
    await db.meta.put({ key: CURRENT_ACCOUNT_KEY, value: accountId });
}

// Called on explicit logout. Pending outbox entries are intentionally NOT
// wiped by a session merely expiring while offline - only a real, confirmed
// logout clears them (and the caller is expected to have already warned the
// user if any were still pending).
export async function clearOfflineDataOnLogout() {
    await clearAllOfflineData();
    await db.meta.delete(CURRENT_ACCOUNT_KEY);
}
