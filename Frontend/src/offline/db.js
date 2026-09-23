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

// Etapa 1 mirror tables - simple CRUD modules (Products, Categories, Units,
// Customers, Suppliers). Each row is stored EXACTLY as the corresponding
// list endpoint returns it (same `_id`/snake_case shape the API already
// uses - see Backend's `toExternalId`/`mapProduct` etc.), so a component
// reading from the mirror needs no translation versus reading from the API.
// Primary key is `_id` - the same field every one of these endpoints uses.
db.version(2).stores({
    products: "_id",
    categories: "_id",
    units: "_id",
    customers: "_id",
    suppliers: "_id",
});

// Etapa 2 - Orders. Unlike the Etapa 1 tables above, this is NOT a full
// mirror of every order the account has ever created - GET /orders is
// paginated server-side with no "give me everything" mode, and an
// established business's order history can be arbitrarily large. Instead
// this table is a best-effort cache: whatever page/filter the user actually
// viewed while online gets written through (see useOrders.js), plus
// whatever this device created/edited while offline. Offline order
// browsing is therefore "what's already been seen", not "the full ledger" -
// see entitySync.js for why "orders" has no full-resync pull registered.
db.version(3).stores({
    orders: "_id",
});

// Etapa 3 - Purchases. Unlike Orders, GET /purchases returns everything in
// one call (no pagination) - same full-mirror shape as the Etapa 1 tables,
// so it gets a real full-resync pull registered in entitySync.js instead of
// Orders' page-cache treatment.
db.version(4).stores({
    purchases: "_id",
});

// Etapa 3 - Finance cash accounts. Small full-mirror catalog, same shape as
// the Etapa 1 tables. Cash movements/reconciliation are NOT mirrored (see
// useCashAccounts.js) - that's a materially more complex ledger/matching
// workflow, out of scope here per the plan's own classification (class C).
db.version(5).stores({
    cashAccounts: "_id",
});

// Etapa 4 - Stock transfers between locations.
// - `pointsOfSale` is a small full-mirror catalog like Etapa 1 - but note
//   its primary key is `id`, NOT `_id`: GET /points-of-sale is one of the
//   few endpoints that returns the raw Prisma row unmapped (confirmed
//   against pointOfSale.controller.js - no toExternalId/snake_case there).
//   Declaring the wrong keyPath here wouldn't error, it would just silently
//   collapse every row onto the same `undefined` key - worth calling out so
//   the next entity added here doesn't assume `_id` is universal.
// - `stockTransfers` follows the same full-resync treatment as Purchases:
//   GET /stock-transfers with no filters returns every transfer this
//   account/role can see (capped at 200 server-side), which is close enough
//   to "everything" at SMB scale.
// - `locationStockSummaries` isn't a real entity the API exposes as a list -
//   it's GET /products/:id/location-stock's per-product aggregate
//   (available/in-transit per location), invented as its own small mirror
//   here (keyed by product id under `_id`) so LocationStockPanel has
//   something to read offline. Write-through only, one row per product
//   actually viewed - there's no "fetch every product's summary" endpoint
//   to register a full-resync pull against.
db.version(6).stores({
    pointsOfSale: "id",
    stockTransfers: "_id",
    locationStockSummaries: "_id",
});

// Etapa 4 - Quotations. Both GET /purchase-quotations and
// GET /sales-quotations return everything in one call (no pagination),
// same full-mirror shape as Purchases.
db.version(7).stores({
    purchaseQuotations: "_id",
    salesQuotations: "_id",
});

// Receipt acknowledgment (RADIAN acuse de recibo/recepción/aceptación/reclamo
// for purchases from a supplier that issues its own real invoice - see
// receiptAcknowledgment.service.js). Same invented-mirror shape as
// locationStockSummaries above: GET /purchases/:id/receipt-acknowledgment is
// a per-purchase result, not a list endpoint, so this is keyed by purchaseId
// under `_id`, write-through only (one row per purchase actually viewed), no
// full-resync pull registered in entitySync.js.
db.version(8).stores({
    receiptAcknowledgments: "_id",
});

// Lotes/vencimiento (tracksBatches products). Same invented-mirror shape as
// locationStockSummaries - GET /products/:id/batches is a per-product list,
// not something with a "give me everyone's" endpoint, so this is keyed by
// product id under `_id`, write-through only (one row per product actually
// viewed via BatchesPanel), no full-resync pull registered in
// entitySync.js. The batches themselves aren't independently mutable from
// the client (no create/edit-batch UI - they're a byproduct of purchases/
// adjustments/transfers, which already queue offline through their own
// entities), so this table only ever needs read-through caching, never the
// outbox.
db.version(9).stores({
    productBatches: "_id",
});

// Production orders (manufacturing) - GET /production-orders returns
// everything in one call (no pagination), same full-mirror shape as
// Purchases/StockTransfers.
db.version(10).stores({
    productionOrders: "_id",
});

// Nómina (Fases 1-6). Employees and PayrollPeriods each return everything
// in one call (no pagination) - same full-mirror shape as Purchases.
// PayrollPeriod's own documents/lines travel embedded in its own row (see
// payroll.controller.js#mapPeriod), so there's no separate mirror table for
// those - exactly like Purchase's own PurchaseDetail lines.
db.version(11).stores({
    employees: "_id",
    payrollPeriods: "_id",
});

// Garantías (warranties). Like Orders, GET /warranties paginates server-side
// (no "everything" mode) so this is a page-cache write-through, not a full
// mirror - see useWarranties.js and this file's comment on "orders" above.
db.version(12).stores({
    warranties: "_id",
});

// Mirror tables added as each module is wired for offline support - keep in
// sync with the list above so account/logout resets actually clear them.
export const MIRROR_ENTITIES = ["products", "categories", "units", "customers", "suppliers", "orders", "purchases", "cashAccounts", "pointsOfSale", "stockTransfers", "locationStockSummaries", "purchaseQuotations", "salesQuotations", "receiptAcknowledgments", "productBatches", "productionOrders", "employees", "payrollPeriods", "warranties"];

const CURRENT_ACCOUNT_KEY = "currentAccountId";

// Every offline table other than the two account-scoping columns below gets
// wiped here, so this needs to be extended (not duplicated) as entity tables
// are added in later stages.
async function clearAllOfflineData() {
    const tables = [db.outbox, db.syncCursor, ...MIRROR_ENTITIES.map((name) => db.table(name))];
    await db.transaction("rw", tables, async () => {
        await db.outbox.clear();
        await db.syncCursor.clear();
        await Promise.all(MIRROR_ENTITIES.map((name) => db.table(name).clear()));
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
