import { test } from "node:test";
import assert from "node:assert/strict";
import { createSyncCore, OUTBOX_STATUS } from "../src/index.js";

// In-memory fake implementing the storage-adapter contract from README.md -
// no Dexie, no SQLite, just Maps. Good enough to exercise the exact same
// orchestration logic the real Dexie adapter drives in the browser.
function createInMemoryStorage() {
    let nextId = 1;
    const outboxRows = new Map();
    const mirrorTables = new Map();
    const cursors = new Map();

    return {
        outbox: {
            async add(entry) {
                const localId = nextId++;
                outboxRows.set(localId, { localId, ...entry });
                return localId;
            },
            async get(localId) {
                return outboxRows.get(localId);
            },
            async update(localId, patch) {
                outboxRows.set(localId, { ...outboxRows.get(localId), ...patch });
            },
            async remove(localId) {
                outboxRows.delete(localId);
            },
            async listByStatus(statuses) {
                return [...outboxRows.values()]
                    .filter((row) => statuses.includes(row.status))
                    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            },
            async countByStatus(statuses) {
                return [...outboxRows.values()].filter((row) => statuses.includes(row.status)).length;
            },
        },
        mirror: {
            async replaceAll(entity, records) {
                const table = new Map();
                for (const record of records) table.set(record._id, record);
                mirrorTables.set(entity, table);
            },
            async upsert(entity, record) {
                const table = mirrorTables.get(entity) ?? new Map();
                table.set(record._id, record);
                mirrorTables.set(entity, table);
            },
            async upsertMany(entity, records) {
                const table = mirrorTables.get(entity) ?? new Map();
                for (const record of records) table.set(record._id, record);
                mirrorTables.set(entity, table);
            },
            async remove(entity, id) {
                mirrorTables.get(entity)?.delete(id);
            },
            async get(entity, id) {
                return mirrorTables.get(entity)?.get(id);
            },
            async readAll(entity) {
                return [...(mirrorTables.get(entity)?.values() ?? [])];
            },
        },
        cursor: {
            async get(entity) {
                return cursors.get(entity);
            },
            async put(entity, cursor, updatedAt) {
                cursors.set(entity, { entity, cursor, updatedAt });
            },
        },
    };
}

function createFakeConnectivity(online = true) {
    let state = online;
    const listeners = new Set();
    return {
        getConnectivityState: () => state,
        subscribeConnectivity(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setOnline(next) {
            state = next;
            for (const listener of listeners) listener(next);
        },
    };
}

// `responses` is a queue of functions, one per call to .request(); each
// returns either { data } (success) or throws an error shaped like axios's
// (error.response.status set = deterministic rejection, unset = network
// failure). Records every call's config for inspection.
function createFakeHttpClient(responses) {
    const calls = [];
    let i = 0;
    return {
        calls,
        async request(config) {
            calls.push(config);
            const respond = responses[i++];
            if (!respond) throw new Error("no more fake responses queued");
            return respond(config);
        },
    };
}

function buildSyncCore({ httpClient, connectivity = createFakeConnectivity(true), mirrorEntities = ["products"] }) {
    const storage = createInMemoryStorage();
    return createSyncCore({ storage, httpClient, connectivity, mirrorEntities });
}

test("idempotency key is generated once and reused on retry", async () => {
    const httpClient = createFakeHttpClient([
        () => {
            const err = new Error("network down");
            throw err; // no `response` -> transient, retryable
        },
        (config) => ({ data: { data: { _id: "real-1", name: "Widget" } } }),
    ]);
    const syncCore = buildSyncCore({ httpClient });

    await syncCore.entityQueue.queueCreate({ entity: "products", url: "/products", fields: { name: "Widget" } });

    await syncCore.syncEngine.drainOutbox(); // fails transiently, stays PENDING/ERROR
    await syncCore.syncEngine.drainOutbox(); // "reconnect" retry, succeeds

    assert.equal(httpClient.calls.length, 2);
    const [firstKey, secondKey] = httpClient.calls.map((c) => c.headers["Idempotency-Key"]);
    assert.ok(firstKey, "idempotency key should be set on the first attempt");
    assert.equal(secondKey, firstKey, "retry must reuse the same idempotency key, not generate a new one");
});

test("a deterministic (4xx) rejection becomes CONFLICT and is never retried automatically", async () => {
    const httpClient = createFakeHttpClient([
        () => {
            const err = new Error("stale edit conflict");
            err.response = { status: 409 };
            throw err;
        },
    ]);
    const syncCore = buildSyncCore({ httpClient });

    await syncCore.entityQueue.queueUpdate({ entity: "products", url: "/products/1", id: "1", fields: { name: "x" } });

    await syncCore.syncEngine.drainOutbox();
    assert.equal(httpClient.calls.length, 1);

    // A second drain cycle must not touch the CONFLICT entry again -
    // listPending only returns PENDING/ERROR.
    await syncCore.syncEngine.drainOutbox();
    assert.equal(httpClient.calls.length, 1, "a CONFLICT entry must never be auto-retried");
});

test("a transient (network) failure stops draining the rest of the queue", async () => {
    const httpClient = createFakeHttpClient([
        () => {
            throw new Error("connection dropped"); // no `response` -> transient
        },
    ]);
    const syncCore = buildSyncCore({ httpClient });

    await syncCore.entityQueue.queueCreate({ entity: "products", url: "/products", fields: { name: "A" } });
    await syncCore.entityQueue.queueCreate({ entity: "products", url: "/products", fields: { name: "B" } });

    await syncCore.syncEngine.drainOutbox();

    // Only the first entry should have been attempted - the second must
    // still be untouched (PENDING), ready for the next reconnect. The first
    // becomes ERROR (still returned by listPending, since ERROR entries are
    // eligible for the next automatic retry) - that's two entries in
    // listPending now, by design, not a sign B was also attempted.
    assert.equal(httpClient.calls.length, 1, "the second entry must never be attempted in this drain cycle");
    const pending = await syncCore.outbox.listPending();
    assert.equal(pending.length, 2);
    const [entryA, entryB] = pending;
    assert.equal(entryA.status, OUTBOX_STATUS.ERROR);
    assert.equal(entryB.status, OUTBOX_STATUS.PENDING);
});

test("a confirmed create replaces the optimistic mirror record with the server's", async () => {
    const httpClient = createFakeHttpClient([() => ({ data: { data: { _id: "real-42", name: "Widget" } } })]);
    const syncCore = buildSyncCore({ httpClient });

    const optimistic = await syncCore.entityQueue.queueCreate({
        entity: "products",
        url: "/products",
        fields: { name: "Widget" },
    });
    assert.match(optimistic._id, /^offline-/);
    assert.equal(optimistic._pendingSync, true);

    await syncCore.syncEngine.drainOutbox();

    const rows = await syncCore.mirror.readMirrorAll("products");
    assert.equal(rows.length, 1, "the temp optimistic row must be gone, replaced by exactly one real row");
    assert.equal(rows[0]._id, "real-42");
});
