import test from "node:test";
import assert from "node:assert/strict";
import { buildItcycleTotals, buildItcycleWithholdingTotals, calculateCreditNoteRemainingBase } from "../services/electronicInvoicing.service.js";

// Regression test for a real bug found 2026-08-29: buildItcycleTotals used
// to blend every line into a single invented "effective rate" tax subtotal
// (e.g. ~12% for a mix of 19% and 5% lines). DIAN validates
// TaxAmount = TaxableAmount x Percent per cac:TaxSubtotal against its own
// rate catalog, so a blended rate is not a real DIAN rate and fails outright
// on the first order that mixes tax rates.
test("buildItcycleTotals keeps mixed tax rates as separate subtotals under one TaxTotal per code", () => {
    const lines = [
        { lineExtensionAmount: 100000, taxTotals: [{ taxAmount: 19000, subtotals: [{ taxableAmount: 100000, taxAmount: 19000, percent: 19, taxScheme: { code: "01" } }] }] },
        { lineExtensionAmount: 50000, taxTotals: [{ taxAmount: 2500, subtotals: [{ taxableAmount: 50000, taxAmount: 2500, percent: 5, taxScheme: { code: "01" } }] }] },
        { lineExtensionAmount: 30000, taxTotals: [] },
    ];

    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);

    assert.equal(taxTotals.length, 1, "both rates share tax code 01, so they land under a single TaxTotal");
    assert.equal(taxTotals[0].taxAmount, 21500);
    assert.deepEqual(
        taxTotals[0].subtotals.map((s) => s.percent).sort((a, b) => a - b),
        [5, 19],
        "each rate keeps its own real subtotal instead of being blended into one invented percentage"
    );
    assert.equal(legalMonetaryTotal.lineExtensionAmount, 180000);
    assert.equal(legalMonetaryTotal.payableAmount, 201500);
});

test("buildItcycleTotals collapses same-rate lines into one subtotal instead of duplicating it per line", () => {
    const lines = [
        { lineExtensionAmount: 100000, taxTotals: [{ taxAmount: 19000, subtotals: [{ taxableAmount: 100000, taxAmount: 19000, percent: 19, taxScheme: { code: "01" } }] }] },
        { lineExtensionAmount: 200000, taxTotals: [{ taxAmount: 38000, subtotals: [{ taxableAmount: 200000, taxAmount: 38000, percent: 19, taxScheme: { code: "01" } }] }] },
    ];

    const { taxTotals } = buildItcycleTotals(lines);

    assert.equal(taxTotals.length, 1);
    assert.equal(taxTotals[0].subtotals.length, 1);
    assert.equal(taxTotals[0].subtotals[0].taxableAmount, 300000);
    assert.equal(taxTotals[0].subtotals[0].taxAmount, 57000);
});

test("buildItcycleTotals returns no tax totals for a fully tax-exempt order", () => {
    const lines = [{ lineExtensionAmount: 30000, taxTotals: [] }];

    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);

    assert.deepEqual(taxTotals, []);
    assert.equal(legalMonetaryTotal.taxInclusiveAmount, 30000);
});

test("buildItcycleWithholdingTotals returns nothing for a customer with no configured rates", () => {
    const result = buildItcycleWithholdingTotals(
        { withholdingIncomePercent: null, withholdingIcaPercent: null, withholdingVatPercent: null },
        { lineExtensionAmount: 100000 },
        [{ taxAmount: 19000, subtotals: [{ taxScheme: { code: "01" } }] }]
    );
    assert.deepEqual(result, []);
});

test("buildItcycleWithholdingTotals applies income/ica to the pre-tax sale amount and vat to the IVA amount", () => {
    const customer = { withholdingIncomePercent: 2.5, withholdingIcaPercent: 0.966, withholdingVatPercent: 15 };
    const legalMonetaryTotal = { lineExtensionAmount: 100000 };
    const taxTotals = [{ taxAmount: 19000, subtotals: [{ taxableAmount: 100000, taxAmount: 19000, percent: 19, taxScheme: { code: "01" } }] }];

    const result = buildItcycleWithholdingTotals(customer, legalMonetaryTotal, taxTotals);

    assert.equal(result.length, 3);
    const byCode = Object.fromEntries(result.map((t) => [t.subtotals[0].taxScheme.code, t]));
    assert.equal(byCode["06"].taxAmount, 2500); // ReteRenta: 2.5% of 100000
    assert.equal(byCode["06"].subtotals[0].taxableAmount, 100000);
    assert.equal(byCode["07"].taxAmount, 966); // ReteICA: 0.966% of 100000
    assert.equal(byCode["05"].taxAmount, 2850); // ReteIVA: 15% of the 19000 IVA, not the sale amount
    assert.equal(byCode["05"].subtotals[0].taxableAmount, 19000);
});

test("buildItcycleWithholdingTotals only includes the withholding types the customer actually has configured", () => {
    const result = buildItcycleWithholdingTotals(
        { withholdingIncomePercent: 4, withholdingIcaPercent: null, withholdingVatPercent: null },
        { lineExtensionAmount: 50000 },
        []
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].subtotals[0].taxScheme.code, "06");
    assert.equal(result[0].taxAmount, 2000);
});

test("calculateCreditNoteRemainingBase separates available revenue by frozen tax rate", () => {
    const result = calculateCreditNoteRemainingBase({
        orderDetails: [
            { id: "a", quantity: 2, returnedQuantity: 0, unitcost: 100, taxRateApplied: 19 },
            { id: "b", quantity: 3, returnedQuantity: 1, unitcost: 50, taxRateApplied: 5 },
            { id: "c", quantity: 1, returnedQuantity: 0, unitcost: 40, taxRateApplied: 0 },
        ],
    });

    assert.deepEqual(result, { "0": 40, "5": 100, "19": 200 });
});

test("calculateCreditNoteRemainingBase discounts prior financial notes", () => {
    const result = calculateCreditNoteRemainingBase({
        orderDetails: [{ id: "a", quantity: 2, returnedQuantity: 0, unitcost: 100, taxRateApplied: 19 }],
        acceptedCreditNotes: [
            { localEffectStatus: "applied", localEffectPayload: { kind: "financial", amount: 75, taxRate: 19 } },
        ],
    });

    assert.equal(result["19"], 125);
});

test("calculateCreditNoteRemainingBase discounts an accepted restock still pending locally exactly once", () => {
    const result = calculateCreditNoteRemainingBase({
        orderDetails: [{ id: "a", quantity: 3, returnedQuantity: 1, unitcost: 100, taxRateApplied: 19 }],
        acceptedCreditNotes: [
            {
                localEffectStatus: "failed",
                localEffectPayload: { kind: "restock", items: [{ orderDetailId: "a", quantity: 1 }] },
            },
            {
                localEffectStatus: "applied",
                localEffectPayload: { kind: "restock", items: [{ orderDetailId: "a", quantity: 1 }] },
            },
        ],
    });

    // returnedQuantity already includes the applied note; only the failed
    // note needs an additional fiscal subtraction.
    assert.equal(result["19"], 100);
});
