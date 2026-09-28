import test from "node:test";
import assert from "node:assert/strict";
import { detectAccountingState, describeAccountingState } from "../services/assistantAccountingState.service.js";
import { buildTurnMessage } from "../services/assistantAgent.service.js";
import { shouldLoadAccountingState } from "../services/assistant.service.js";

// Minimal stand-in for the Prisma models the detectors read. Each option
// is what the "database" holds for the account under test.
const fakeDb = ({
    entries = [],
    drafts = [],
    openPastPeriods = [],
    failed = {},
} = {}) => ({
    journalEntry: {
        findFirst: async ({ where }) =>
            entries.find((entry) => !where.sourceType || entry.sourceType === where.sourceType) || null,
    },
    manualJournalVoucher: {
        count: async () => drafts.length,
        findFirst: async () => drafts[0] || null,
    },
    accountingPeriod: {
        count: async () => openPastPeriods.length,
        findFirst: async () => openPastPeriods[0] || null,
    },
    recurringExpenseTemplate: { findMany: async () => failed.expenses || [] },
    recurringJournalTemplate: { findMany: async () => failed.journals || [] },
    fixedAsset: { findMany: async () => failed.assets || [] },
    prepaidExpense: { findMany: async () => failed.prepaids || [] },
});

const keys = (findings) => findings.map((finding) => finding.key);
const now = new Date("2026-09-28T12:00:00Z");

test("empty books only report no_activity (not a missing opening balance too)", async () => {
    const findings = await detectAccountingState({ accountId: "a", db: fakeDb(), now });
    assert.deepEqual(keys(findings), ["no_activity"]);
    assert.equal(findings[0].target, "accounting.overview");
});

test("books with activity but no opening balance report it, pointing to the opening screen", async () => {
    const findings = await detectAccountingState({ accountId: "a", db: fakeDb({ entries: [{ sourceType: "order_sale" }] }), now });
    assert.deepEqual(keys(findings), ["no_opening_balance"]);
    assert.equal(findings[0].target, "accounting.opening_balance");
});

test("a complete, tidy ledger reports nothing", async () => {
    const db = fakeDb({ entries: [{ sourceType: "opening_balance" }, { sourceType: "order_sale" }] });
    assert.deepEqual(await detectAccountingState({ accountId: "a", db, now }), []);
});

test("findings come back most important first, with counts and dates in the summary", async () => {
    const db = fakeDb({
        entries: [{ sourceType: "opening_balance" }],
        drafts: [{ entryDate: new Date("2026-07-03T00:00:00Z") }, {}],
        openPastPeriods: [{ year: 2026, month: 6 }],
        failed: { assets: [{ name: "Camioneta", lastRunError: "Periodo cerrado" }] },
    });
    const findings = await detectAccountingState({ accountId: "a", db, now });
    assert.deepEqual(keys(findings), ["failed_automations", "draft_vouchers", "open_past_periods"]);
    assert.match(findings[0].summary, /depreciación de activo fijo "Camioneta" \(error: Periodo cerrado\)/);
    assert.equal(findings[0].target, "accounting.fixed_assets");
    assert.match(findings[1].summary, /2 comprobante\(s\).*03\/07\/2026/);
    assert.match(findings[2].summary, /06\/2026/);
    assert.ok(findings.every((finding) => finding.nudge.es && finding.nudge.en && finding.cta.es && finding.cta.en));
});

test("a detector that throws is skipped without taking the others down", async () => {
    const db = fakeDb({ entries: [{ sourceType: "order_sale" }] });
    db.manualJournalVoucher.count = async () => {
        throw new Error("boom");
    };
    const original = console.error;
    console.error = () => {};
    try {
        const findings = await detectAccountingState({ accountId: "a", db, now });
        assert.deepEqual(keys(findings), ["no_opening_balance"]);
    } finally {
        console.error = original;
    }
});

test("describeAccountingState distinguishes 'no access' from 'nothing pending'", () => {
    assert.equal(describeAccountingState(null), null);
    assert.match(describeAccountingState([]), /no se detectó nada pendiente/);
    assert.match(
        describeAccountingState([{ summary: "Falta la apertura.", target: "accounting.opening_balance" }]),
        /- Falta la apertura\. \[pantalla: accounting\.opening_balance\]/
    );
});

test("buildTurnMessage puts the company state right next to the question", () => {
    const withState = buildTurnMessage({ message: "¿por dónde empiezo?", knowledge: "(sin resultados)", companyState: "ESTADO: sin apertura" });
    assert.match(withState, /^ESTADO: sin apertura\nANTES DE PREGUNTAR/);
    assert.match(withState, /MENSAJE DE LA PERSONA:\n¿por dónde empiezo\?$/);
    assert.doesNotMatch(buildTurnMessage({ message: "x", knowledge: "k" }), /ANTES DE PREGUNTAR/);
});

test("shouldLoadAccountingState only fires for accounting conversations", () => {
    assert.equal(shouldLoadAccountingState({ module: "accounting", message: "hola" }), true);
    assert.equal(shouldLoadAccountingState({ module: "products", message: "¿cómo liquido el IVA?" }), true);
    assert.equal(shouldLoadAccountingState({ module: "products", message: "mi cuenta está activa" }), false);
    assert.equal(
        shouldLoadAccountingState({ module: "products", message: "sí", history: [{ role: "assistant", content: "¿Ya cerraste el periodo?" }] }),
        true
    );
});
