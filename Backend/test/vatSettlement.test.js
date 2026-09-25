import test from "node:test";
import assert from "node:assert/strict";
import { computeVatSettlement, getVatPeriodRange } from "../services/vatSettlement.service.js";

const totals = (lines) => lines.reduce((sum, line) => ({ debit: sum.debit + line.debit, credit: sum.credit + line.credit }), { debit: 0, credit: 0 });
const byRole = (lines) => Object.fromEntries(lines.map((line) => [line.role, line]));

test("IVA settlement: payable balance, partially covered by a prior saldo a favor", () => {
    const result = computeVatSettlement({ generated: 1900000, deductible: 760000, carryForward: 140000 });
    assert.equal(result.net, 1140000);
    assert.equal(result.carryForwardApplied, 140000);
    assert.equal(result.netPayable, 1000000);
    assert.equal(result.creditBalance, 0);
    const lines = byRole(result.lines);
    assert.deepEqual(lines.generated, { role: "generated", debit: 1900000, credit: 0 });
    assert.deepEqual(lines.deductible, { role: "deductible", debit: 0, credit: 760000 });
    assert.deepEqual(lines.credit, { role: "credit", debit: 0, credit: 140000 });
    assert.deepEqual(lines.payable, { role: "payable", debit: 0, credit: 1000000 });
    const sum = totals(result.lines);
    assert.equal(sum.debit, sum.credit);
});

test("IVA settlement: saldo a favor bigger than the net only uses what's needed", () => {
    const result = computeVatSettlement({ generated: 300000, deductible: 100000, carryForward: 500000 });
    assert.equal(result.carryForwardApplied, 200000);
    assert.equal(result.netPayable, 0);
    assert.equal(byRole(result.lines).payable, undefined, "zero lines are dropped");
});

test("IVA settlement: more deductible than generated leaves a saldo a favor", () => {
    const result = computeVatSettlement({ generated: 190000, deductible: 475000, carryForward: 0 });
    assert.equal(result.net, -285000);
    assert.equal(result.netPayable, 0);
    assert.equal(result.creditBalance, 285000);
    assert.deepEqual(byRole(result.lines).credit, { role: "credit", debit: 285000, credit: 0 });
    const sum = totals(result.lines);
    assert.equal(sum.debit, sum.credit);
});

test("IVA settlement: negative balances (returns over sales) flip their side", () => {
    const result = computeVatSettlement({ generated: -19000, deductible: 0 });
    assert.deepEqual(byRole(result.lines).generated, { role: "generated", debit: 0, credit: 19000 });
    assert.equal(result.creditBalance, 19000);
    const sum = totals(result.lines);
    assert.equal(sum.debit, sum.credit);
});

test("IVA settlement: a period with no IVA is a declaración en ceros", () => {
    const result = computeVatSettlement({ generated: 0, deductible: 0, carryForward: 0 });
    assert.deepEqual(result.lines, []);
    assert.equal(result.netPayable, 0);
});

test("IVA period ranges: bimestral and cuatrimestral, UTC month boundaries", () => {
    const b3 = getVatPeriodRange("bimonthly", 2026, 3);
    assert.equal(b3.startDate.toISOString(), "2026-05-01T00:00:00.000Z");
    assert.equal(b3.endDate.toISOString(), "2026-06-30T23:59:59.999Z");
    const c3 = getVatPeriodRange("four_monthly", 2026, 3);
    assert.equal(c3.startDate.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(c3.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
    assert.throws(() => getVatPeriodRange("bimonthly", 2026, 7), { code: "vat_settlement_period_invalid" });
    assert.throws(() => getVatPeriodRange("four_monthly", 2026, 4), { code: "vat_settlement_period_invalid" });
    assert.throws(() => getVatPeriodRange("monthly", 2026, 1), { code: "vat_settlement_periodicity_invalid" });
});

test("IVA settlement: ReteIVA customers withheld reduces the payable, and can flip it to saldo a favor", () => {
    const payable = computeVatSettlement({ generated: 1900000, deductible: 760000, withheldVat: 200000, carryForward: 40000 });
    assert.equal(payable.withheldVatApplied, 200000);
    assert.equal(payable.carryForwardApplied, 40000);
    assert.equal(payable.netPayable, 900000);
    assert.deepEqual(byRole(payable.lines).withheld, { role: "withheld", debit: 0, credit: 200000 });
    let sum = totals(payable.lines);
    assert.equal(sum.debit, sum.credit);

    // Withholdings bigger than the net: all of it is still swept, the excess
    // becomes saldo a favor (and the prior credit isn't touched).
    const favor = computeVatSettlement({ generated: 190000, deductible: 100000, withheldVat: 150000, carryForward: 40000 });
    assert.equal(favor.netPayable, 0);
    assert.equal(favor.carryForwardApplied, 0);
    assert.equal(favor.creditBalance, 60000);
    sum = totals(favor.lines);
    assert.equal(sum.debit, sum.credit);
});
