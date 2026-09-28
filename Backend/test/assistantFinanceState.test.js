import test from "node:test";
import assert from "node:assert/strict";
import { createFinanceDetectors } from "../services/assistantFinanceState.service.js";
import { runDetectors, ALL_STATE_DETECTORS } from "../services/assistantCompanyState.service.js";

const now = new Date("2026-09-28T12:00:00Z");

// The detectors reuse the Finance screen's own services - faked here with
// the same response shapes (getCashIntegrity, the payables/receivables plans).
const detectorsWith = ({ integrity, payables, receivables, calls = {} } = {}) =>
    createFinanceDetectors({
        cashIntegrity: async () =>
            integrity || { operational: [], summary: { operational_differences: 0, accounting_differences: 0 } },
        payablesPlan: async (args) => {
            calls.payables = args;
            return payables || { documents: [], summary: { funding_gap: 0 } };
        },
        receivablesPlan: async (args) => {
            calls.receivables = args;
            return receivables || { documents: [], summary: { overdue: 0 } };
        },
    });

const fakeDb = ({ activeCashAccounts = 1, unmatched = [] } = {}) => ({
    cashAccount: { count: async () => activeCashAccounts },
    bankStatementEntry: {
        count: async () => unmatched.length,
        findFirst: async () => unmatched[0] || null,
    },
});

const detect = (detectors, db, scope) => runDetectors({ detectors, accountId: "acc", db, now, scope });
const keys = (findings) => findings.map((finding) => finding.key);

test("a healthy finance setup reports nothing", async () => {
    assert.deepEqual(await detect(detectorsWith(), fakeDb()), []);
});

test("no active cash/bank account comes first - nothing else works without one", async () => {
    const findings = await detect(detectorsWith(), fakeDb({ activeCashAccounts: 0 }));
    assert.deepEqual(keys(findings), ["finance_no_cash_accounts"]);
    assert.equal(findings[0].target, "finance");
});

test("integrity differences name the affected accounts with their difference", async () => {
    const integrity = {
        operational: [
            { name: "Caja general", status: "difference", difference: 15000 },
            { name: "Bancolombia", status: "ok", difference: 0 },
        ],
        summary: { operational_differences: 1, accounting_differences: 2 },
    };
    const [finding] = await detect(detectorsWith({ integrity }), fakeDb());
    assert.equal(finding.key, "finance_cash_integrity");
    assert.match(finding.summary, /1 caja\(s\)\/banco\(s\).*"Caja general" \(diferencia \$\s?15\.000\)/);
    assert.match(finding.summary, /2 grupo\(s\).*libro mayor/);
    assert.doesNotMatch(finding.summary, /Bancolombia/);
});

test("overdue payables and receivables are summarized from the planners, ordered by priority", async () => {
    const payables = {
        documents: [
            { status: "overdue", pending: 100000, days_overdue: 12 },
            { status: "overdue", pending: 50000, days_overdue: 40 },
            { status: "current", pending: 999999, days_overdue: 0 },
        ],
        summary: { funding_gap: 30000 },
    };
    const receivables = { documents: [{ status: "overdue" }, { status: "due_soon" }], summary: { overdue: 80000 } };
    const findings = await detect(detectorsWith({ payables, receivables }), fakeDb({ unmatched: [{ entryDate: new Date("2026-08-02T00:00:00Z") }] }));

    assert.deepEqual(keys(findings), ["finance_overdue_payables", "finance_overdue_receivables", "finance_unmatched_bank_entries"]);
    assert.match(findings[0].summary, /2 obligación\(es\).*150\.000.*40 días.*supera el efectivo disponible por \$\s?30\.000/);
    assert.match(findings[1].summary, /1 factura\(s\).*80\.000/);
    assert.match(findings[2].summary, /1 línea\(s\).*02\/08\/2026/);
    assert.equal(findings[2].target, "finance.reconciliation");
});

test("payables/receivables respect the person's point-of-sale scope", async () => {
    const calls = {};
    await detect(detectorsWith({ calls }), fakeDb(), { posScopeAll: false, posScopeIds: ["pos-1"] });
    assert.deepEqual(calls.payables, { accountId: "acc", posScopeAll: false, posScopeIds: ["pos-1"] });
    assert.deepEqual(calls.receivables, { accountId: "acc", posScopeAll: false, posScopeIds: ["pos-1"] });
});

test("finding keys are unique across modules (the learning tables key on them)", () => {
    const all = ALL_STATE_DETECTORS.map((detector) => detector.key);
    assert.equal(new Set(all).size, all.length);
    assert.ok(all.includes("no_opening_balance") && all.includes("finance_overdue_payables"));
});
