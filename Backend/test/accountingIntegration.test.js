import test from "node:test";
import assert from "node:assert/strict";
import { computeOrderReceivable } from "../services/receivableBalance.service.js";
import { cashFlowCategory } from "../services/financialStatements.service.js";
import { buildAmortizationSchedule, computeExtraPaymentPlan, deriveObligationState } from "../services/financialObligation.service.js";
import { buildPayablePlan } from "../services/accountsPayable.service.js";

test("cartera: one receivable definition (credit notes, diferencia en cambio, castigos)", () => {
    const orderDetails = [{ total: 1000, taxAmount: 190, refundAmount: 100, returnedTaxAmount: 19 }];
    assert.deepEqual(computeOrderReceivable({ orderDetails, payments: [{ amount: 500, exchangeRateDifference: 20 }], creditReduction: 71, writtenOff: 100 }), { total: 1000, paid: 480, writtenOff: 100, pending: 420 });
    assert.equal(computeOrderReceivable({ orderDetails, payments: [] }).pending, 1071);
});

test("flujo de caja: loans and owners' capital are financing, asset sales investing", () => {
    for (const type of ["loan_disbursement", "loan_payment", "loan_extra_payment", "capital_contribution", "equity_distribution"]) assert.equal(cashFlowCategory(type), "financing", type);
    assert.equal(cashFlowCategory("fixed_asset_disposal"), "investing");
    assert.equal(cashFlowCategory("opening_balance"), "adjustments");
    for (const type of ["order_payment", "vat_payment", "ica_payment", "prepaid_expense", "payroll_payment"]) assert.equal(cashFlowCategory(type), "operating", type);
});

test("préstamo: without extra payments the derived schedule is the original one", () => {
    const obligation = { principal: 10000000, annualRate: 24, termMonths: 12, firstPaymentDate: new Date("2026-02-15T12:00:00Z"), installmentsPaid: 0, status: "active", plannedInstallment: null };
    const original = buildAmortizationSchedule(obligation);
    assert.deepEqual(deriveObligationState(obligation, []).future.map((r) => r.principal), original.rows.map((r) => r.principal));
    const afterTwo = { ...obligation, installmentsPaid: 2 };
    const paid = original.rows.slice(0, 2).map((r) => ({ principal: r.principal }));
    assert.deepEqual(deriveObligationState(afterTwo, paid).future.map((r) => r.interest), original.rows.slice(2).map((r) => r.interest));
});

test("préstamo: extra payment reduces the installment or the term", () => {
    const obligation = { principal: 12000000, annualRate: 18, termMonths: 12, firstPaymentDate: new Date("2026-01-10T12:00:00Z"), installmentsPaid: 3, status: "active", plannedInstallment: null };
    const original = buildAmortizationSchedule(obligation);
    const outstanding = original.rows[2].balance_after;
    const lower = computeExtraPaymentPlan({ obligation, outstanding, amount: 3000000, strategy: "reduce_installment" });
    assert.equal(lower.termMonths, 12);
    assert.ok(lower.plannedInstallment < original.installment);
    const shorter = computeExtraPaymentPlan({ obligation, outstanding, amount: 3000000, strategy: "reduce_term" });
    assert.equal(shorter.plannedInstallment, original.installment);
    assert.ok(shorter.termMonths < 12);
    const future = deriveObligationState({ ...obligation, plannedInstallment: shorter.plannedInstallment, termMonths: shorter.termMonths }, original.rows.slice(0, 3).map((r) => ({ principal: r.principal })).concat([{ principal: 3000000 }])).future;
    assert.equal(future[future.length - 1].balance_after, 0);
    assert.equal(future.length, shorter.termMonths - 3);
    assert.equal(computeExtraPaymentPlan({ obligation, outstanding, amount: outstanding, strategy: "reduce_term" }).paidOff, true);
});

test("cuentas por pagar: loans and taxes compete for the same cash as purchases", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const plan = buildPayablePlan({
        purchases: [],
        availableCash: 1000,
        now,
        otherObligations: [
            { id: "loan:1", kind: "loan_installment", number: "3/12", due_date: new Date("2026-09-20T12:00:00Z"), supplier: { name: "Banco" }, total: 800, paid: 0, pending: 800 },
            { id: "vat:1", kind: "vat", number: "IVA 4/2026", due_date: null, supplier: { name: "DIAN" }, total: 500, paid: 0, pending: 500 },
        ],
    });
    assert.deepEqual(plan.documents.map((d) => [d.id, d.status, d.coverage]), [["loan:1", "overdue", "full"], ["vat:1", "unscheduled", "partial"]]);
    assert.equal(plan.summary.funding_gap, 300);
});
