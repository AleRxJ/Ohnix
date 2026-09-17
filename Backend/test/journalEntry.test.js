import test from "node:test";
import assert from "node:assert/strict";
import { isSingleEntrySource } from "../services/journalEntry.service.js";
import { buildAccountingThirdParty, calculatePurchaseReturnValues, getLineCostBasis } from "../services/accountingPosting.service.js";
import { calculateRetentionReturn, calculateWithholdingAmount } from "../services/withholdingConcept.service.js";
import { summarizeWithholdingRows } from "../services/withholdingReport.service.js";
import { buildPayablePlan } from "../services/accountsPayable.service.js";
import { buildReceivablePlan } from "../services/accountsReceivable.service.js";
import { isReconciliationAmountMatch, scoreReconciliationCandidate } from "../services/bankReconciliation.service.js";

test("one-to-one accounting sources are idempotent when they have a source id", () => {
    for (const sourceType of [
        "order_sale",
        "purchase",
        "order_payment",
        "purchase_payment",
        "order_cancellation",
        "credit_note_restock",
        "credit_note_financial",
        "period_close",
        "inventory_adjustment",
        "transfer_discrepancy",
        "manual_journal",
        "manual_journal_reversal",
        "period_reopen",
        "period_reclose",
        "cash_transfer",
        "cash_adjustment",
    ]) {
        assert.equal(isSingleEntrySource(sourceType, "source-1"), true, sourceType);
    }
});

test("partial returns remain repeatable for the same business document", () => {
    assert.equal(isSingleEntrySource("order_return", "order-1"), false);
    assert.equal(isSingleEntrySource("purchase_return", "purchase-1"), false);
});

test("sources without an identity are not treated as idempotent", () => {
    assert.equal(isSingleEntrySource("manual_expense", null), false);
    assert.equal(isSingleEntrySource("order_sale", ""), false);
});

test("withholding report separates caused, reversed and current balances", () => {
    const report = summarizeWithholdingRows([
        { tax_type: "income", base_amount: 1000, withheld_amount: 25, returned_withheld_amount: 5 },
        { tax_type: "income", base_amount: 500, withheld_amount: 12.5, returned_withheld_amount: 0 },
        { tax_type: "ica", base_amount: 1000, withheld_amount: 6.9, returned_withheld_amount: 6.9 },
    ]);
    assert.deepEqual(report.totals, { base: 2500, withheld: 44.4, reversed: 11.9, net: 32.5 });
    assert.deepEqual(report.by_type, [
        { tax_type: "income", base: 1500, withheld: 37.5, reversed: 5, net: 32.5, documents: 2 },
        { tax_type: "ica", base: 1000, withheld: 6.9, reversed: 6.9, net: 0, documents: 1 },
    ]);
});

test("payable planner uses returns, withholdings, payments and cash in one balance", () => {
    const plan = buildPayablePlan({ availableCash: 80, now: new Date("2026-08-31T12:00:00Z"), purchases: [{ id: "p1", purchaseNo: "C-1", purchaseDate: new Date("2026-08-01"), dueDate: new Date("2026-08-20"), supplier: { id: "s1", name: "Proveedor" }, purchaseDetails: [{ total: 100, taxAmount: 19, refundAmount: 10, returnedTaxAmount: 1.9 }], retentions: [{ withheldAmount: 2.5, returnedWithheldAmount: 0.5 }], payments: [{ amount: 25 }] }] });
    assert.equal(plan.documents[0].pending, 80.1);
    assert.equal(plan.documents[0].suggested_payment, 80);
    assert.equal(plan.documents[0].coverage, "partial");
    assert.equal(plan.summary.funding_gap, 0.1);
    assert.equal(plan.documents[0].aging_bucket, "days_1_30");
    assert.equal(plan.summary.aging.days_1_30, 80.1);
});

test("receivable planner prioritizes overdue net balances after returns, credit notes and payments", () => {
    const plan = buildReceivablePlan({ now: new Date("2026-08-31T12:00:00Z"), orders: [{ id: "o1", invoiceNo: "F-1", orderDate: new Date("2026-08-01"), dueDate: new Date("2026-08-15"), customer: { id: "c1", name: "Cliente" }, financialCreditReduction: 5, orderDetails: [{ total: 100, taxAmount: 19, refundAmount: 20, returnedTaxAmount: 3.8 }], payments: [{ amount: 40 }] }] });
    assert.equal(plan.documents[0].pending, 50.2);
    assert.equal(plan.documents[0].status, "overdue");
    assert.equal(plan.summary.overdue, 50.2);
    assert.equal(plan.documents[0].aging_bucket, "days_1_30");
    assert.equal(plan.summary.aging.days_1_30, 50.2);
});

test("bank reconciliation requires the same amount and sign", () => {
    assert.equal(isReconciliationAmountMatch(100, 100), true);
    assert.equal(isReconciliationAmountMatch(-100, -100), true);
    assert.equal(isReconciliationAmountMatch(100, -100), false);
    assert.equal(isReconciliationAmountMatch(100, 99.99), false);
});

test("reconciliation suggestions reject distant or opposite movements", () => {
    const entry = { amount: 100, entryDate: "2026-08-10", description: "Pago cliente" };
    assert.equal(scoreReconciliationCandidate(entry, { delta: -100, createdAt: "2026-08-10", reason: "Pago cliente" }), null);
    assert.equal(scoreReconciliationCandidate(entry, { delta: 100, createdAt: "2026-07-01", reason: "Pago cliente" }), null);
    assert.ok(scoreReconciliationCandidate(entry, { delta: 100, createdAt: "2026-08-11", reason: "Pago cliente" }) >= 90);
});

test("a return keeps the frozen sale cost after the product cost changes", () => {
    assert.equal(getLineCostBasis({ costBasisApplied: 120, buyingPrice: 175 }), 120);
});

test("historical rows fall back to the live cost only until migration backfill", () => {
    assert.equal(getLineCostBasis({ costBasisApplied: null, buyingPrice: 175 }), 175);
});

test("purchase return separates supplier refund from inventory carrying value", () => {
    assert.deepEqual(
        calculatePurchaseReturnValues([
            { quantity: 2, unitcost: 100, taxRateApplied: 19, inventoryCostApplied: 180 },
        ]),
        { refundBase: 200, taxTotal: 38, inventoryTotal: 180, variance: 20 }
    );
});

test("purchase return reports an expense variance when carrying value is higher", () => {
    assert.equal(
        calculatePurchaseReturnValues([
            { quantity: 1, unitcost: 80, taxRateApplied: 0, inventoryCostApplied: 95 },
        ]).variance,
        -15
    );
});

test("accounting third party freezes identity fields from the business entity", () => {
    assert.deepEqual(
        buildAccountingThirdParty("customer", { id: "c1", name: "Cliente Uno", identification: "9001" }),
        { type: "customer", id: "c1", name: "Cliente Uno", document: "9001" }
    );
});

test("accounting third party supports suppliers without a tax document", () => {
    assert.deepEqual(
        buildAccountingThirdParty("supplier", { id: "s1", name: "Proveedor" }),
        { type: "supplier", id: "s1", name: "Proveedor", document: null }
    );
});

test("withholding calculation uses the configured base and percent units", () => {
    assert.deepEqual(
        calculateWithholdingAmount(
            { baseType: "subtotal", ratePercent: 2.5, minimumBaseAmount: 100 },
            { subtotal: 1000, vat: 190 }
        ),
        { baseAmount: 1000, minimumBaseAmount: 100, applies: true, withheldAmount: 25 }
    );
});

test("VAT withholding uses VAT rather than the tax-inclusive purchase total", () => {
    assert.equal(
        calculateWithholdingAmount(
            { baseType: "vat", ratePercent: 15, minimumBaseAmount: 0 },
            { subtotal: 1000, vat: 190 }
        ).withheldAmount,
        28.5
    );
});

test("withholding below its configured minimum base does not apply", () => {
    assert.deepEqual(
        calculateWithholdingAmount(
            { baseType: "total", ratePercent: 1, minimumBaseAmount: 2000 },
            { subtotal: 1000, vat: 190 }
        ),
        { baseAmount: 1190, minimumBaseAmount: 2000, applies: false, withheldAmount: 0 }
    );
});

test("partial retention returns use the original frozen amount proportionally", () => {
    assert.deepEqual(
        calculateRetentionReturn(
            { baseAmount: 1000, withheldAmount: 25, returnedBaseAmount: 0, returnedWithheldAmount: 0 },
            400
        ),
        { baseNow: 400, withheldNow: 10 }
    );
});

test("final retention return absorbs rounding and never exceeds the original", () => {
    assert.deepEqual(
        calculateRetentionReturn(
            { baseAmount: 333.33, withheldAmount: 8.33, returnedBaseAmount: 111.11, returnedWithheldAmount: 2.78 },
            999
        ),
        { baseNow: 222.22, withheldNow: 5.55 }
    );
});
