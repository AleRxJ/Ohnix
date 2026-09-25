import test from "node:test";
import assert from "node:assert/strict";
import { computeImpairment, impairmentBucket, normalizeImpairmentRates, DEFAULT_IMPAIRMENT_RATES } from "../services/receivableImpairment.service.js";
import { buildAmortizationSchedule, monthlyRateFromAnnual } from "../services/financialObligation.service.js";
import { computeIcaDeclaration, getIcaPeriodRange } from "../services/icaDeclaration.service.js";
import { buildKardexRows, summarizeValuation } from "../services/inventoryValuation.service.js";

test("deterioro: buckets by days past due and default fiscal rates", () => {
    assert.equal(impairmentBucket(0), "current");
    assert.equal(impairmentBucket(90), "d1_90");
    assert.equal(impairmentBucket(91), "d91_180");
    assert.equal(impairmentBucket(360), "d181_360");
    assert.equal(impairmentBucket(361), "over_360");
    assert.deepEqual(normalizeImpairmentRates({}), DEFAULT_IMPAIRMENT_RATES);
    assert.throws(() => normalizeImpairmentRates({ over_360: 120 }), { code: "impairment_rate_invalid" });

    const asOfDate = new Date("2026-09-30T12:00:00Z");
    const documents = [
        { id: "a", pending: 1000000, due_date: "2026-09-15T00:00:00Z" }, // 15 days
        { id: "b", pending: 2000000, due_date: "2026-05-01T00:00:00Z" }, // ~152 days
        { id: "c", pending: 500000, due_date: null, document_date: "2025-06-01T00:00:00Z" }, // > 360, no due date
    ];
    const { bucketTotals, required, rows } = computeImpairment({ documents, rates: DEFAULT_IMPAIRMENT_RATES, asOfDate });
    assert.equal(bucketTotals.d1_90, 1000000);
    assert.equal(bucketTotals.d91_180, 2000000);
    assert.equal(bucketTotals.over_360, 500000);
    assert.equal(required, 100000 + 75000);
    assert.equal(rows.find((r) => r.id === "c").provision, 75000);
});

test("préstamo: French schedule ends at exactly zero, interest on the running balance", () => {
    // 24% EA -> ~1.8088% monthly.
    assert.ok(Math.abs(monthlyRateFromAnnual(24) - 0.018087582) < 1e-8);
    const { installment, rows } = buildAmortizationSchedule({ principal: 10000000, annualRate: 24, termMonths: 12, firstPaymentDate: new Date("2026-02-15T12:00:00Z") });
    assert.equal(rows.length, 12);
    assert.equal(rows[0].interest, 180875.82);
    assert.equal(rows[0].principal, Math.round((installment - 180875.82) * 100) / 100);
    assert.equal(rows[11].balance_after, 0);
    const paidPrincipal = rows.reduce((s, r) => s + r.principal, 0);
    assert.equal(Math.round(paidPrincipal * 100), 1000000000);
    assert.equal(rows[1].due_date.toISOString().slice(0, 10), "2026-03-15");

    // 0% and end-of-month dates.
    const zero = buildAmortizationSchedule({ principal: 1000, annualRate: 0, termMonths: 3, firstPaymentDate: new Date("2026-01-31T12:00:00Z") });
    assert.deepEqual(zero.rows.map((r) => r.principal), [333.33, 333.33, 333.34]);
    assert.equal(zero.rows[1].due_date.toISOString().slice(0, 10), "2026-02-28");
});

test("ICA: base x tarifa por mil, avisos 15%, bomberil, ReteICA capped", () => {
    const result = computeIcaDeclaration({ grossIncome: 120000000, excludedIncome: 20000000, ratePerThousand: 9.66, avisosTableros: true, bomberilPercent: 3, withheldIca: 150000 });
    assert.equal(result.taxableBase, 100000000);
    assert.equal(result.icaTax, 966000);
    assert.equal(result.avisosTableros, 144900);
    assert.equal(result.bomberilSurcharge, 28980);
    assert.equal(result.total, 1139880);
    assert.equal(result.withheldIcaApplied, 150000);
    assert.equal(result.netPayable, 989880);

    const covered = computeIcaDeclaration({ grossIncome: 1000000, ratePerThousand: 10, withheldIca: 50000 });
    assert.equal(covered.withheldIcaApplied, 10000);
    assert.equal(covered.netPayable, 0);

    assert.equal(getIcaPeriodRange("annual", 2026, 1).endDate.toISOString(), "2026-12-31T23:59:59.999Z");
    assert.throws(() => getIcaPeriodRange("annual", 2026, 2), { code: "ica_period_invalid" });
});

test("kardex: valuation groups locations and flags unvalued stock; running balances", () => {
    const summary = summarizeValuation([
        { productId: "p1", pointOfSaleId: "a", quantity: 10, value: "1000.00" },
        { productId: "p1", pointOfSaleId: "b", quantity: 5, value: "550.00" },
        { productId: "p2", pointOfSaleId: "a", quantity: 3, value: null },
    ]);
    assert.deepEqual(summary.find((r) => r.productId === "p1"), { productId: "p1", quantity: 15, value: 1550, unvalued: false });
    assert.equal(summary.find((r) => r.productId === "p2").unvalued, true);

    const rows = buildKardexRows({ opening: { quantity: 10, value: 1000 }, movements: [
        { id: "m1", delta: 5, valueDelta: "600.00", unitCostApplied: "120.0000", createdAt: new Date() },
        { id: "m2", delta: -8, valueDelta: "-853.33", unitCostApplied: "106.6667", createdAt: new Date() },
    ] });
    assert.equal(rows[0].balance_quantity, 15);
    assert.equal(rows[0].balance_value, 1600);
    assert.equal(rows[1].quantity_out, 8);
    assert.equal(rows[1].balance_value, 746.67);
});
