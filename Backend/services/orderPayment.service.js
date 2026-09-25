import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordCashMovement, creditCashAccount } from "./cashMovement.service.js";
import { buildAccountingThirdParty, postOrderPaymentJournalEntry } from "./accountingPosting.service.js";
import { getActivePaymentMethod } from "./paymentMethod.service.js";
import { computeOrderReceivable, loadReceivableAdjustments } from "./receivableBalance.service.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));
// Fase 4 (multi-moneda) - only ever consulted when the order isn't COP AND
// the caller explicitly passed settleInFull: true (see registerOrderPayment
// below). A COP order's payment cap (pending + 0.001) never changes.
// Guards against a fat-finger amount being silently booked as a huge
// "ganancia por diferencia en cambio" - real day-to-day TRM movement is
// nowhere near this for USD/COP, so 15% is a generous sanity ceiling, not a
// realistic expectation.
const MAX_FX_VARIANCE_PERCENT = 0.15;

// Receivable balance used by payment validation - see
// receivableBalance.service.js for the single definition every screen
// shares (credit notes, diferencia en cambio, castigos).
export const getOrderPendingBalance = async (orderId, db = prisma) => {
    const order = await db.order.findUnique({
        where: { id: orderId },
        select: { id: true, total: true, orderStatus: true, currencyCode: true, orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } }, payments: { select: { amount: true, exchangeRateDifference: true } } },
    });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    const { creditReduction, writtenOff } = await loadReceivableAdjustments([orderId], { db });
    const balance = computeOrderReceivable({ orderDetails: order.orderDetails, payments: order.payments, creditReduction: creditReduction.get(orderId), writtenOff: writtenOff.get(orderId) });
    return { order, total: balance.total, paid: balance.paid, writtenOff: balance.writtenOff, pending: balance.pending };
};

// What the customer's configured flat rates (Customer.withholding*Percent -
// the same ones electronicInvoicing.service.js#buildItcycleWithholdingTotals
// prints on the invoice) say should be withheld on this sale, less what
// earlier payments already recorded. A suggestion only - the payment modal
// pre-fills it, the user confirms against the customer's actual certificate.
// Same bases as the invoice: ReteFuente/ReteICA on the pre-tax sale amount,
// ReteIVA on the IVA itself, both net of returns.
export const getOrderWithholdingSuggestion = async ({ accountId, orderId }) => {
    const order = await prisma.order.findFirst({
        where: { id: orderId, createdById: accountId },
        select: {
            customer: { select: { withholdingIncomePercent: true, withholdingVatPercent: true, withholdingIcaPercent: true } },
            orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } },
            payments: { select: { withheldIncomeTax: true, withheldVat: true, withheldIca: true } },
        },
    });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    const percent = (value) => (value != null ? Number(value) : 0);
    const rates = {
        incomeTax: percent(order.customer?.withholdingIncomePercent),
        vat: percent(order.customer?.withholdingVatPercent),
        ica: percent(order.customer?.withholdingIcaPercent),
    };
    const saleBase = order.orderDetails.reduce((sum, row) => sum + Number(row.total) - Number(row.refundAmount), 0);
    const vatBase = order.orderDetails.reduce((sum, row) => sum + Number(row.taxAmount) - Number(row.returnedTaxAmount), 0);
    const already = order.payments.reduce((sum, row) => ({
        incomeTax: sum.incomeTax + Number(row.withheldIncomeTax),
        vat: sum.vat + Number(row.withheldVat),
        ica: sum.ica + Number(row.withheldIca),
    }), { incomeTax: 0, vat: 0, ica: 0 });
    const remaining = (base, rate, done) => Math.max(round2((base * rate) / 100 - done), 0);
    return {
        rates,
        incomeTax: remaining(saleBase, rates.incomeTax, already.incomeTax),
        vat: remaining(vatBase, rates.vat, already.vat),
        ica: remaining(saleBase, rates.ica, already.ica),
    };
};

export const listOrderPayments = async ({ accountId, orderId }) => {
    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId }, select: { id: true } });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");

    return prisma.orderPayment.findMany({
        where: { orderId: order.id },
        include: {
            cashAccount: { select: { id: true, name: true } },
            createdBy: { select: { id: true, username: true } },
            paymentMethod: { select: { id: true, name: true } },
        },
        orderBy: { paidAt: "desc" },
    });
};

// `withholdings` = retenciones the customer practiced on this payment. They
// count toward `amount` (the receivable clears in full) but never reach the
// cash account - see OrderPayment.withheldIncomeTax's schema comment.
export const normalizeOrderPaymentWithholdings = (withholdings = {}, amount) => {
    const values = {
        withheldIncomeTax: round2(withholdings?.incomeTax || 0),
        withheldVat: round2(withholdings?.vat || 0),
        withheldIca: round2(withholdings?.ica || 0),
    };
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
        throw new ApiError(400, "Withholdings must be zero or positive amounts.", [], "", "order_payment_withholding_invalid");
    }
    const total = round2(values.withheldIncomeTax + values.withheldVat + values.withheldIca);
    if (total >= Number(amount)) {
        throw new ApiError(422, "Withholdings must be less than the payment amount.", [], "", "order_payment_withholding_exceeds_amount");
    }
    return { ...values, total };
};

export const registerOrderPayment = async ({ accountId, actorId, orderId, amount, cashAccountId, method, reference, settleInFull, paymentMethodId, withholdings }) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "Payment amount must be greater than zero.", [], "", "order_payment_amount_invalid");
    }
    const withheld = normalizeOrderPaymentWithholdings(withholdings, numericAmount);

    const order = await prisma.order.findFirst({
        where: { id: orderId, createdById: accountId },
        include: { customer: { select: { id: true, name: true, identification: true } } },
    });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    if (order.orderStatus === "cancelled") {
        throw new ApiError(400, "Payments cannot be recorded for a cancelled order.", [], "", "order_payment_order_cancelled");
    }

    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id: cashAccountId, createdById: accountId, isActive: true },
    });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "order_payment_cash_account_not_found");

    // Fase 5 (causación automática) - the processor's cut on THIS payment,
    // frozen from the method's current rate. Capped at the payment's own
    // amount (a misconfigured >100% rate can never make cashDelta negative).
    const paymentMethod = await getActivePaymentMethod(accountId, paymentMethodId);
    // Charged on what the processor actually handled - the customer only
    // ran amount minus the retenciones through it.
    const processedAmount = round2(numericAmount - withheld.total);
    const feeAmount = paymentMethod
        ? Math.min(round2(processedAmount * (Number(paymentMethod.feePercent) / 100) + Number(paymentMethod.feeFixedAmount)), processedAmount)
        : 0;

    try {
        return await prisma.$transaction(async (tx) => {
        const { pending } = await getOrderPendingBalance(orderId, tx);
        // settleInFull opts into a DIFFERENT rule, not a relaxation of the
        // usual one: instead of capping at `pending`, the full gap between
        // what actually came in and what was booked (over OR under) becomes
        // the diferencia en cambio - only reachable for a foreign-currency
        // order, so a COP order's behavior is untouched either way.
        let exchangeRateDifference = 0;
        if (order.currencyCode !== "COP" && settleInFull === true) {
            exchangeRateDifference = round2(numericAmount - pending);
            const variance = pending > 0 ? Math.abs(exchangeRateDifference) / pending : (numericAmount > 0 ? 1 : 0);
            if (variance > MAX_FX_VARIANCE_PERCENT) {
                throw new ApiError(422, `Payment (${numericAmount}) differs from the order balance (${pending}) by more than ${MAX_FX_VARIANCE_PERCENT * 100}%.`, [], "", "order_payment_fx_variance_too_large");
            }
        } else if (numericAmount > pending + 0.001) {
            throw new ApiError(422, `Payment (${numericAmount}) exceeds the order balance (${pending}).`, [], "", "order_payment_exceeds_balance");
        }

        const payment = await tx.orderPayment.create({
            data: {
                orderId,
                amount: numericAmount,
                exchangeRateDifference,
                paymentMethodId: paymentMethod?.id || null,
                feeAmount,
                withheldIncomeTax: withheld.withheldIncomeTax,
                withheldVat: withheld.withheldVat,
                withheldIca: withheld.withheldIca,
                cashAccountId,
                method: method?.trim() || null,
                reference: reference?.trim() || null,
                createdById: actorId,
            },
        });

        // The processor keeps its cut before depositing - only the NET
        // amount actually reaches the cash account, even though the
        // customer paid (and 1305 clears by) the full sale amount.
        const cashDelta = round2(numericAmount - feeAmount - withheld.total);
        const balanceAfter = await creditCashAccount(tx, { cashAccountId, amount: cashDelta });

        await recordCashMovement(tx, {
            cashAccountId,
            delta: cashDelta,
            balanceAfter,
            sourceType: "order_payment",
            sourceId: payment.id,
            reason: `Pago de pedido ${order.invoiceNo}`,
            createdById: actorId,
        });

        await postOrderPaymentJournalEntry(tx, {
            accountId,
            createdById: actorId,
            payment: { ...payment, paymentMethod },
            cashAccount,
            order,
            thirdParty: buildAccountingThirdParty("customer", order.customer),
        });

        return payment;
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") {
            throw new ApiError(409, "Payment could not be recorded because the balance changed. Try again.", [], "", "order_payment_concurrent_change");
        }
        throw error;
    }
};
