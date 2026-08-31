import test from "node:test";
import assert from "node:assert/strict";
import { isSingleEntrySource } from "../services/journalEntry.service.js";
import { getLineCostBasis } from "../services/accountingPosting.service.js";

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
