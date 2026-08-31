import test from "node:test";
import assert from "node:assert/strict";
import { netFiscalDetail, summarizeFinancialCreditNoteEntry, summarizeVatReversalEntry } from "../controllers/report.controller.js";

test("netFiscalDetail preserves the full frozen base and tax without returns", () => {
    assert.deepEqual(
        netFiscalDetail({ quantity: 4, returnedQuantity: 0, total: 400, taxAmount: 76 }),
        { remainingQuantity: 4, base: 400, taxAmount: 76 }
    );
});

test("netFiscalDetail prorates base and frozen tax after a partial return", () => {
    assert.deepEqual(
        netFiscalDetail({ quantity: 4, returnedQuantity: 1, total: 400, taxAmount: 76 }),
        { remainingQuantity: 3, base: 300, taxAmount: 57 }
    );
});

test("netFiscalDetail removes a fully returned line from fiscal and cartera totals", () => {
    assert.deepEqual(
        netFiscalDetail({ quantity: 2, returnedQuantity: 2, total: 199.99, taxAmount: 38 }),
        { remainingQuantity: 0, base: 0, taxAmount: 0 }
    );
});

test("netFiscalDetail clamps corrupt over-returned quantities instead of producing negative reports", () => {
    assert.deepEqual(
        netFiscalDetail({ quantity: 2, returnedQuantity: 3, total: 200, taxAmount: 38 }),
        { remainingQuantity: 0, base: 0, taxAmount: 0 }
    );
});

test("netFiscalDetail rounds proportional cents deterministically", () => {
    assert.deepEqual(
        netFiscalDetail({ quantity: 3, returnedQuantity: 1, total: 100, taxAmount: 19 }),
        { remainingQuantity: 2, base: 66.67, taxAmount: 12.67 }
    );
});

test("summarizeFinancialCreditNoteEntry reads the exact reductions from the journal", () => {
    const entryDate = new Date("2026-08-20T12:00:00.000Z");
    assert.deepEqual(
        summarizeFinancialCreditNoteEntry({
            sourceId: "credit-note-1",
            entryDate,
            lines: [
                { debit: 100, credit: 0, chartAccount: { code: "4135" } },
                { debit: 19, credit: 0, chartAccount: { code: "240805" } },
                { debit: 0, credit: 119, chartAccount: { code: "1305" } },
            ],
        }),
        {
            sourceId: "credit-note-1",
            entryDate,
            base: 100,
            taxAmount: 19,
            receivableReduction: 119,
            rate: 19,
        }
    );
});

test("summarizeFinancialCreditNoteEntry supports zero-tax adjustments", () => {
    assert.deepEqual(
        summarizeFinancialCreditNoteEntry({
            sourceId: "credit-note-2",
            entryDate: null,
            lines: [
                { debit: 75, credit: 0, chartAccount: { code: "4135" } },
                { debit: 0, credit: 75, chartAccount: { code: "1305" } },
            ],
        }),
        {
            sourceId: "credit-note-2",
            entryDate: null,
            base: 75,
            taxAmount: 0,
            receivableReduction: 75,
            rate: 0,
        }
    );
});

test("summarizeVatReversalEntry reads a sales return from revenue and output VAT", () => {
    assert.deepEqual(
        summarizeVatReversalEntry({
            sourceType: "order_return",
            sourceId: "order-1",
            entryDate: new Date("2026-08-21T00:00:00.000Z"),
            lines: [
                { debit: 50, credit: 0, chartAccount: { code: "4135" } },
                { debit: 9.5, credit: 0, chartAccount: { code: "240805" } },
            ],
        }),
        {
            sourceType: "order_return",
            sourceId: "order-1",
            entryDate: new Date("2026-08-21T00:00:00.000Z"),
            kind: "sale",
            base: 50,
            taxAmount: 9.5,
        }
    );
});

test("summarizeVatReversalEntry reads a purchase return from inventory and input VAT", () => {
    const result = summarizeVatReversalEntry({
        sourceType: "purchase_return",
        sourceId: "purchase-1",
        entryDate: null,
        lines: [
            { debit: 0, credit: 80, chartAccount: { code: "1435" } },
            { debit: 0, credit: 15.2, chartAccount: { code: "240810" } },
        ],
    });
    assert.equal(result.kind, "purchase");
    assert.equal(result.base, 80);
    assert.equal(result.taxAmount, 15.2);
});
