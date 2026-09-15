import test from "node:test";
import assert from "node:assert/strict";
import { upsertDiscovery, updateDiscoveryStatus, setTeamExplanation, getDiscoveryDetail, listDiscoveries } from "../services/discoveryEngine.service.js";

// Minimal in-memory stand-in for the slice of Prisma's client upsertDiscovery
// actually calls - every detector funnels through upsertDiscovery, so this
// is the highest-leverage place to test the dedupe/perception-gap/learned-
// confidence logic without a real database.
const createFakeDb = () => {
    let counter = 0;
    let fakeClock = Date.now();
    const nextTimestamp = () => new Date((fakeClock += 1000));
    const discoveries = new Map();
    const patternStats = new Map();
    let orders = [];

    const matchesClause = (rowValue, clause) => {
        // A field a fake row simply never had set is `undefined`, but
        // Prisma/SQL treats an unset column the same as an explicit NULL -
        // without this normalization, `{ not: null }` would wrongly match
        // a row that never had the field written at all.
        const value = rowValue === undefined ? null : rowValue;
        if (clause && typeof clause === "object" && !(clause instanceof Date)) {
            if ("notIn" in clause) return !clause.notIn.includes(value);
            if ("not" in clause) return value !== clause.not;
            if ("in" in clause) return clause.in.includes(value);
        }
        return value === clause;
    };

    const matchesWhere = (row, where) =>
        Object.entries(where).every(([key, clause]) => {
            if (key === "OR") return clause.some((sub) => matchesWhere(row, sub));
            return matchesClause(row[key], clause);
        });

    const findMatches = (where) => [...discoveries.values()].filter((row) => matchesWhere(row, where));

    const applyOrderBy = (rows, orderBy) => {
        if (!orderBy) return rows;
        const [[field, direction]] = Object.entries(orderBy);
        const sorted = [...rows].sort((a, b) => new Date(a[field]) - new Date(b[field]));
        return direction === "desc" ? sorted.reverse() : sorted;
    };

    return {
        _discoveries: discoveries,
        discoveryPatternStats: {
            findUnique: async ({ where: { detectorKey } }) => patternStats.get(detectorKey) || null,
        },
        discovery: {
            findFirst: async ({ where, orderBy }) => applyOrderBy(findMatches(where), orderBy)[0] || null,
            findMany: async ({ where }) => findMatches(where || {}),
            create: async ({ data }) => {
                const id = `disc_${++counter}`;
                const { evidence, entities, predictions, ...scalars } = data;
                const row = {
                    id,
                    createdAt: nextTimestamp(),
                    updatedAt: nextTimestamp(),
                    ...scalars,
                    evidence: (evidence?.create || []).map((e, i) => ({ id: `ev_${id}_${i}`, discoveryId: id, createdAt: nextTimestamp(), ...e })),
                    entities: (entities?.create || []).map((e, i) => ({ id: `en_${id}_${i}`, discoveryId: id, ...e })),
                    predictions: (predictions?.create || []).map((p, i) => ({ id: `pr_${id}_${i}`, discoveryId: id, checkedAt: null, outcome: null, ...p })),
                };
                discoveries.set(id, row);
                return row;
            },
            update: async ({ where: { id }, data }) => {
                const row = discoveries.get(id);
                const { evidence, ...scalars } = data;
                Object.assign(row, scalars);
                // Mirrors Prisma's real @updatedAt: always re-stamped on
                // update regardless of what (if anything) was passed for
                // it, using a monotonic fake clock so ordering by
                // updatedAt is deterministic even across same-millisecond
                // test execution.
                row.updatedAt = nextTimestamp();
                if (evidence?.create) {
                    row.evidence = evidence.create.map((e, i) => ({ id: `ev_${id}_${Date.now()}_${i}`, discoveryId: id, createdAt: nextTimestamp(), ...e }));
                }
                return row;
            },
        },
        discoveryEvidence: {
            deleteMany: async ({ where: { discoveryId } }) => {
                const row = discoveries.get(discoveryId);
                if (row) row.evidence = [];
                return { count: 0 };
            },
            create: async ({ data }) => {
                const row = discoveries.get(data.discoveryId);
                const entry = { id: `ev_${data.discoveryId}_${row.evidence.length}`, createdAt: nextTimestamp(), ...data };
                if (row) row.evidence.push(entry);
                return entry;
            },
        },
        discoveryEntityLink: {
            findMany: async ({ where }) => {
                const row = discoveries.get(where.discoveryId);
                if (!row) return [];
                return row.entities.filter((e) => (where.entityType ? e.entityType === where.entityType : true) && (where.role ? e.role === where.role : true));
            },
        },
        // Only the seasonal-explanation checker (customer_churn_risk) needs
        // Order history - empty by default, seed via _setOrders for the one
        // test that exercises that path end to end.
        order: { findMany: async () => orders },
        _setPatternStats: (detectorKey, stats) => patternStats.set(detectorKey, stats),
        _setOrders: (rows) => {
            orders = rows;
        },
    };
};

const baseArgs = (overrides = {}) => ({
    accountId: "acct_1",
    detectorKey: "test_detector",
    type: "risk",
    dedupeKey: "test_detector:account",
    title: "Title",
    summary: "Summary",
    scores: { impact: 0.5, novelty: 0.5, urgency: 0.5, confidence: 0.7, reversibility: 0.5 },
    evidence: [{ kind: "metric", label: "L", data: { a: 1 }, sourceType: null, sourceId: null }],
    ...overrides,
});

test("upsertDiscovery creates a new published Discovery on first detection", async () => {
    const db = createFakeDb();
    const { discovery, created } = await upsertDiscovery({ ...baseArgs(), db });
    assert.equal(created, true);
    assert.equal(discovery.status, "published");
    assert.ok(discovery.publishedAt instanceof Date);
    assert.equal(discovery.evidence.length, 1);
});

test("upsertDiscovery updates (not duplicates) a still-open finding with the same dedupeKey", async () => {
    const db = createFakeDb();
    const first = await upsertDiscovery({ ...baseArgs({ title: "First" }), db });
    const second = await upsertDiscovery({ ...baseArgs({ title: "Second" }), db });

    assert.equal(second.created, false);
    assert.equal(second.discovery.id, first.discovery.id);
    assert.equal(second.discovery.title, "Second");
    assert.equal(db._discoveries.size, 1);
});

test("upsertDiscovery evidence is fully replaced (not appended) on update", async () => {
    const db = createFakeDb();
    await upsertDiscovery({ ...baseArgs({ evidence: [{ kind: "metric", label: "A", data: {} }, { kind: "metric", label: "B", data: {} }] }), db });
    const { discovery } = await upsertDiscovery({ ...baseArgs({ evidence: [{ kind: "metric", label: "C", data: {} }] }), db });
    assert.equal(discovery.evidence.length, 1);
    assert.equal(discovery.evidence[0].label, "C");
});

test("upsertDiscovery creates a NEW row when the prior one was dismissed (dedupe excludes closed statuses)", async () => {
    const db = createFakeDb();
    const first = await upsertDiscovery({ ...baseArgs(), db });
    await updateDiscoveryStatus({ accountId: "acct_1", id: first.discovery.id, status: "dismissed", reason: "ya lo resolvimos", db });

    const second = await upsertDiscovery({ ...baseArgs(), db });
    assert.equal(second.created, true);
    assert.notEqual(second.discovery.id, first.discovery.id);
    assert.equal(db._discoveries.size, 2);
});

test("upsertDiscovery attaches perception_gap evidence when a dismissed prior finding recurs", async () => {
    const db = createFakeDb();
    const first = await upsertDiscovery({ ...baseArgs(), db });
    await updateDiscoveryStatus({ accountId: "acct_1", id: first.discovery.id, status: "dismissed", reason: "fue un caso puntual, ya se resolvió", db });

    const second = await upsertDiscovery({ ...baseArgs(), db });
    const gapEvidence = second.discovery.evidence.find((e) => e.kind === "perception_gap");
    assert.ok(gapEvidence, "expected a perception_gap evidence entry");
    assert.equal(gapEvidence.data.previous_explanation, "fue un caso puntual, ya se resolvió");
});

test("upsertDiscovery does NOT attach perception_gap evidence when the prior dismissal had no reason", async () => {
    const db = createFakeDb();
    const first = await upsertDiscovery({ ...baseArgs(), db });
    await updateDiscoveryStatus({ accountId: "acct_1", id: first.discovery.id, status: "dismissed", db }); // no reason

    const second = await upsertDiscovery({ ...baseArgs(), db });
    assert.equal(second.discovery.evidence.some((e) => e.kind === "perception_gap"), false);
});

test("upsertDiscovery does NOT create a perception_gap for a dismissal on a DIFFERENT dedupeKey", async () => {
    const db = createFakeDb();
    const unrelated = await upsertDiscovery({ ...baseArgs({ dedupeKey: "other_detector:account" }), db });
    await updateDiscoveryStatus({ accountId: "acct_1", id: unrelated.discovery.id, status: "dismissed", reason: "no aplica", db });

    const { discovery } = await upsertDiscovery({ ...baseArgs(), db }); // different dedupeKey, first time
    assert.equal(discovery.evidence.some((e) => e.kind === "perception_gap"), false);
});

test("upsertDiscovery blends in a detector's learned confidence once it has enough track record", async () => {
    const db = createFakeDb();
    db._setPatternStats("test_detector", { totalPredictions: 10, correctPredictions: 8, currentConfidence: 0.75 });

    const { discovery } = await upsertDiscovery({ ...baseArgs({ scores: { impact: 0.5, novelty: 0.5, urgency: 0.5, confidence: 0.9, reversibility: 0.5 } }), db });
    assert.notEqual(Number(discovery.confidence), 0.9);
    assert.ok(discovery.evidence.some((e) => e.kind === "learned_confidence"));
});

test("upsertDiscovery leaves confidence alone for a detector with no track record yet", async () => {
    const db = createFakeDb();
    const { discovery } = await upsertDiscovery({ ...baseArgs({ scores: { impact: 0.5, novelty: 0.5, urgency: 0.5, confidence: 0.9, reversibility: 0.5 } }), db });
    assert.equal(Number(discovery.confidence), 0.9);
    assert.equal(discovery.evidence.some((e) => e.kind === "learned_confidence"), false);
});

test("upsertDiscovery keeps two accounts' Discoveries with the same dedupeKey fully independent", async () => {
    const db = createFakeDb();
    await upsertDiscovery({ ...baseArgs({ accountId: "acct_1" }), db });
    await upsertDiscovery({ ...baseArgs({ accountId: "acct_2" }), db });
    assert.equal(db._discoveries.size, 2);
});

test("listDiscoveries and getDiscoveryDetail round-trip a created Discovery", async () => {
    const db = createFakeDb();
    const { discovery } = await upsertDiscovery({ ...baseArgs(), db });

    const list = await listDiscoveries({ accountId: "acct_1", db });
    assert.equal(list.length, 1);
    assert.equal(list[0]._id, discovery.id);

    const detail = await getDiscoveryDetail({ accountId: "acct_1", id: discovery.id, db });
    assert.equal(detail.evidence.length, 1);
    assert.equal(detail.title, "Title");
});

test("getDiscoveryDetail returns null for a mismatched accountId (no cross-tenant leak)", async () => {
    const db = createFakeDb();
    const { discovery } = await upsertDiscovery({ ...baseArgs(), db });
    const detail = await getDiscoveryDetail({ accountId: "someone_elses_account", id: discovery.id, db });
    assert.equal(detail, null);
});

test("setTeamExplanation stores the explanation regardless of status, with no check for an untagged detector", async () => {
    const db = createFakeDb();
    const { discovery } = await upsertDiscovery({ ...baseArgs(), db }); // status: "published"

    const detail = await setTeamExplanation({ accountId: "acct_1", id: discovery.id, explanation: "creemos que es temporada baja", tag: null, db });
    assert.equal(detail.status, "published"); // untouched - not gated behind closing it
    assert.equal(detail.team_explanation, "creemos que es temporada baja");
    assert.ok(detail.team_explanation_at);
    assert.equal(detail.evidence.some((e) => e.kind === "explanation_check"), false);
});

test("upsertDiscovery's perception-gap check now also fires for a RESOLVED discovery with a team explanation (not just a dismissed one)", async () => {
    const db = createFakeDb();
    const first = await upsertDiscovery({ ...baseArgs(), db });
    await setTeamExplanation({ accountId: "acct_1", id: first.discovery.id, explanation: "ya lo resolvimos definitivamente", db });
    await updateDiscoveryStatus({ accountId: "acct_1", id: first.discovery.id, status: "resolved", db });

    const second = await upsertDiscovery({ ...baseArgs(), db });
    assert.equal(second.created, true);
    const gapEvidence = second.discovery.evidence.find((e) => e.kind === "perception_gap");
    assert.ok(gapEvidence, "expected a perception_gap evidence entry from the resolved discovery's explanation");
    assert.equal(gapEvidence.data.previous_explanation, "ya lo resolvimos definitivamente");
});

test("setTeamExplanation with tag 'seasonal' on a customer_churn_risk Discovery runs the real check and attaches its verdict", async () => {
    const db = createFakeDb();
    const { discovery } = await upsertDiscovery({
        ...baseArgs({
            detectorKey: "customer_churn_risk",
            entities: [
                { entityType: "customer", entityId: "c1", role: "at_risk", metadata: {} },
                { entityType: "customer", entityId: "c2", role: "at_risk", metadata: {} },
                { entityType: "customer", entityId: "c3", role: "at_risk", metadata: {} },
            ],
        }),
        db,
    });

    db._setOrders([
        // All 3 customers historically quiet every September for 2 prior years - genuinely seasonal.
        { customerId: "c1", orderDate: new Date(Date.UTC(2024, 2, 10)) },
        { customerId: "c1", orderDate: new Date(Date.UTC(2025, 2, 10)) },
        { customerId: "c2", orderDate: new Date(Date.UTC(2024, 2, 10)) },
        { customerId: "c2", orderDate: new Date(Date.UTC(2025, 2, 10)) },
        { customerId: "c3", orderDate: new Date(Date.UTC(2024, 2, 10)) },
        { customerId: "c3", orderDate: new Date(Date.UTC(2025, 2, 10)) },
    ]);

    // The dispatch chain (setTeamExplanation -> runExplanationCheck ->
    // checkSeasonalExplanation) doesn't thread a `now` override through, so
    // it always evaluates against the real current date - this test only
    // confirms the WIRING reaches the real checker and its result becomes
    // evidence, not a specific verdict (which depends on today's actual
    // month). The checker's own verdict logic has full coverage in
    // customerChurnRiskExplanation.test.js with an injected `now`.
    const detail = await setTeamExplanation({ accountId: "acct_1", id: discovery.id, explanation: "es temporada baja para ellos", tag: "seasonal", db });
    const checkEvidence = detail.evidence.find((e) => e.kind === "explanation_check");
    assert.ok(checkEvidence, "expected an explanation_check evidence entry");
    assert.ok(["supported", "contradicted", "inconclusive"].includes(checkEvidence.data.outcome));
});
