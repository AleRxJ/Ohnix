import test from "node:test";
import assert from "node:assert/strict";
import { documentPaymentDetails } from "../utils/paymentAvailability.js";

test("historical receipt without allocation rows is already fully applied", () => {
    assert.deepEqual(documentPaymentDetails({ id: "p", amount: "125.50" }), {
        id: "p", amount: 125.5, allocated: 125.5, available: 0,
        paid_at: undefined, method: undefined, reference: undefined,
    });
});

test("metadata allocations cannot make a document receipt spendable again", () => {
    const payment = documentPaymentDetails({ amount: 100, allocations: [{ amount: 25 }] });
    assert.equal(payment.allocated, 100);
    assert.equal(payment.available, 0);
});
