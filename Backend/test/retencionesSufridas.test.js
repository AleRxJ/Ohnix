import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrderPaymentWithholdings } from "../services/orderPayment.service.js";
import { buildRentaSettlement } from "../services/rentaDeclaration.service.js";

test("order payment withholdings: normalized, totaled, and capped below the payment", () => {
    assert.deepEqual(normalizeOrderPaymentWithholdings({ incomeTax: 25000, vat: "2850.004", ica: undefined }, 1000000), { withheldIncomeTax: 25000, withheldVat: 2850, withheldIca: 0, total: 27850 });
    assert.deepEqual(normalizeOrderPaymentWithholdings(undefined, 100), { withheldIncomeTax: 0, withheldVat: 0, withheldIca: 0, total: 0 });
    assert.throws(() => normalizeOrderPaymentWithholdings({ vat: -1 }, 100), { code: "order_payment_withholding_invalid" });
    assert.throws(() => normalizeOrderPaymentWithholdings({ incomeTax: 60, ica: 40 }, 100), { code: "order_payment_withholding_exceeds_amount" });
});

test("renta: retenciones sufridas reduce the tax and the next year's anticipo (ET art. 807)", () => {
    // Tax 35,000,000; 75% anticipo = 26,250,000; retenciones 5,000,000.
    const result = buildRentaSettlement(35000000, "later", 5000000);
    assert.equal(result.withholdingsSuffered, 5000000);
    assert.equal(result.anticipo.gross_amount, 26250000);
    assert.equal(result.anticipo.amount, 21250000);
    assert.equal(result.balanceDue, 35000000 - 5000000 + 21250000);

    // Retenciones above the gross anticipo: anticipo floors at zero and the
    // balance can turn into a saldo a favor.
    const favor = buildRentaSettlement(1000000, "first", 2000000);
    assert.equal(favor.anticipo.amount, 0);
    assert.equal(favor.balanceDue, -1000000);
});
