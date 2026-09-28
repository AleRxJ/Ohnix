import test from "node:test";
import assert from "node:assert/strict";
import {
    matchGuidedFindings,
    recordGuidance,
    checkDueGuidance,
    GUIDANCE_CHECK_DAYS,
} from "../services/assistantLearning.service.js";
import { describeCompanyState } from "../services/assistantCompanyState.service.js";

const describeAccountingState = (findings) => describeCompanyState({ accounting: findings });

const now = new Date("2026-09-28T12:00:00Z");
const finding = (key, target, priority = 50) => ({ key, target, priority, summary: `${key} summary` });

// In-memory stand-in for the three learning tables.
const fakeDb = ({ guidance = [], stats = [] } = {}) => {
    const db = {
        guidance,
        stats,
        assistantGuidance: {
            findFirst: async ({ where }) =>
                guidance.find((row) => row.accountId === where.accountId && row.findingKey === where.findingKey && row.checkedAt === null) || null,
            findMany: async ({ where }) => guidance.filter((row) => row.checkedAt === null && row.checkAfter <= where.checkAfter.lte),
            create: async ({ data }) => {
                const row = { id: `g${guidance.length + 1}`, checkedAt: null, outcome: null, ...data };
                guidance.push(row);
                return row;
            },
            update: async ({ where, data }) => Object.assign(guidance.find((row) => row.id === where.id), data),
        },
        assistantGuidanceStats: {
            findUnique: async ({ where }) => stats.find((row) => row.findingKey === where.findingKey) || null,
            upsert: async ({ where, update, create }) => {
                const row = stats.find((r) => r.findingKey === where.findingKey);
                if (row) Object.assign(row, update);
                else stats.push({ ...create });
            },
        },
    };
    return db;
};

test("matchGuidedFindings links a reply to the finding whose screen it sends the person to", () => {
    const findings = [finding("draft_vouchers", "accounting.vouchers", 70), finding("no_opening_balance", "accounting.opening_balance", 60)];
    assert.deepEqual(
        matchGuidedFindings(findings, { navigate: { target: "accounting.opening_balance" } }).map((f) => f.key),
        ["no_opening_balance"]
    );
    // highlight anchors resolve to their screen too
    assert.deepEqual(
        matchGuidedFindings(findings, { highlight: { anchor: "accounting-vouchers-new" } }).map((f) => f.key),
        ["draft_vouchers"]
    );
    assert.deepEqual(matchGuidedFindings(findings, { choices: ["Sí"] }), []);
    assert.deepEqual(matchGuidedFindings(findings, null), []);
});

test("recordGuidance stores a prediction checked GUIDANCE_CHECK_DAYS later, once per open finding", async () => {
    const db = fakeDb();
    const args = {
        db,
        accountId: "acc",
        actorId: "actor",
        conversationId: "c1",
        findings: [finding("no_opening_balance", "accounting.opening_balance")],
        actions: { navigate: { target: "accounting.opening_balance" } },
        now,
    };
    const first = await recordGuidance({ ...args, messageId: "m1" });
    assert.equal(first.findingKey, "no_opening_balance");
    assert.equal(first.checkAfter.getTime(), now.getTime() + GUIDANCE_CHECK_DAYS * 86400000);
    // Same conversation keeps pointing at the same fix: still one attempt.
    assert.equal(await recordGuidance({ ...args, messageId: "m2" }), null);
    assert.equal(db.guidance.length, 1);
});

test("recordGuidance ignores replies that don't guide toward any finding", async () => {
    const db = fakeDb();
    const result = await recordGuidance({
        db,
        accountId: "acc",
        actorId: "actor",
        conversationId: "c1",
        messageId: "m1",
        findings: [finding("no_opening_balance", "accounting.opening_balance")],
        actions: { navigate: { target: "accounting.journal" } },
        now,
    });
    assert.equal(result, null);
    assert.equal(db.guidance.length, 0);
});

test("checkDueGuidance re-runs the detector: gone = resolved, still there = unresolved, and updates the track record", async () => {
    const due = new Date(now.getTime() - 1000);
    const db = fakeDb({
        guidance: [
            { id: "g1", accountId: "fixed", findingKey: "no_opening_balance", checkAfter: due, checkedAt: null },
            { id: "g2", accountId: "stuck", findingKey: "no_opening_balance", checkAfter: due, checkedAt: null },
            { id: "g3", accountId: "later", findingKey: "no_opening_balance", checkAfter: new Date(now.getTime() + 86400000), checkedAt: null },
            { id: "g4", accountId: "x", findingKey: "detector_removed", checkAfter: due, checkedAt: null },
        ],
    });
    const detectors = [{ key: "no_opening_balance", run: async ({ accountId }) => (accountId === "stuck" ? { target: "t" } : null) }];

    const result = await checkDueGuidance({ db, now, detectors });

    assert.deepEqual(result, { checked: 2, resolved: 1, unresolved: 1, skipped: 1 });
    assert.equal(db.guidance.find((row) => row.id === "g1").outcome, "resolved");
    assert.equal(db.guidance.find((row) => row.id === "g2").outcome, "unresolved");
    assert.equal(db.guidance.find((row) => row.id === "g3").checkedAt, null);
    // Removed detector: closed out (so it isn't re-scanned nightly) with no verdict.
    assert.equal(db.guidance.find((row) => row.id === "g4").checkedAt, now);
    assert.equal(db.guidance.find((row) => row.id === "g4").outcome, undefined);
    // Laplace-smoothed like DiscoveryPatternStats: 1 of 2 -> (1+1)/(2+2)
    assert.deepEqual(db.stats[0], { findingKey: "no_opening_balance", totalChecked: 2, resolved: 1, successRate: 0.5 });
});

test("a detector error leaves the guidance unchecked for tomorrow instead of counting it as a failure", async () => {
    const db = fakeDb({ guidance: [{ id: "g1", accountId: "a", findingKey: "k", checkAfter: now, checkedAt: null }] });
    const original = console.error;
    console.error = () => {};
    try {
        const result = await checkDueGuidance({ db, now, detectors: [{ key: "k", run: async () => { throw new Error("db down"); } }] });
        assert.equal(result.checked, 0);
        assert.equal(db.guidance[0].checkedAt, null);
        assert.equal(db.stats.length, 0);
    } finally {
        console.error = original;
    }
});

test("describeAccountingState tells the agent to slow down only with enough evidence of failing guidance", () => {
    const base = { summary: "Falta la apertura.", target: "accounting.opening_balance" };
    const failing = describeAccountingState([{ ...base, track: { totalChecked: 8, resolved: 1, successRate: 0.2 } }]);
    assert.match(failing, /se resolvió en 1 de 8 casos\. Sé más concreto/);
    // Too few samples: the rate is mostly the prior, not evidence.
    assert.doesNotMatch(describeAccountingState([{ ...base, track: { totalChecked: 2, resolved: 0, successRate: 0.25 } }]), /Historial/);
    // Working well: nothing to say.
    assert.doesNotMatch(describeAccountingState([{ ...base, track: { totalChecked: 10, resolved: 9, successRate: 0.833 } }]), /Historial/);
});
