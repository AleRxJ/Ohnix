// Document payments have already settled that document. Allocation metadata
// must never turn these receipts into a second spendable balance.
export const documentPaymentDetails = (payment) => ({
    id: payment.id,
    amount: Number(payment.amount),
    allocated: Number(payment.amount),
    available: 0,
    paid_at: payment.paidAt,
    method: payment.method,
    reference: payment.reference,
});
