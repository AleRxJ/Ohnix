import test from "node:test";
import assert from "node:assert/strict";
import { buildItcycleTotals } from "../services/electronicInvoicing.service.js";

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
