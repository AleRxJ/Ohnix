import test from "node:test";
import assert from "node:assert/strict";
import { isSingleEntrySource } from "../services/journalEntry.service.js";
import { buildAccountingThirdParty, calculatePurchaseReturnValues, getLineCostBasis } from "../services/accountingPosting.service.js";
import { calculateWithholdingAmount } from "../services/withholdingConcept.service.js";

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
