import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordCashMovement, creditCashAccount } from "./cashMovement.service.js";
import { buildAccountingThirdParty, postOrderPaymentJournalEntry } from "./accountingPosting.service.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));
// Fase 4 (multi-moneda) - only ever consulted when the order isn't COP AND
// the caller explicitly passed settleInFull: true (see registerOrderPayment
// below). A COP order's payment cap (pending + 0.001) never changes.
// Guards against a fat-finger amount being silently booked as a huge
// "ganancia por diferencia en cambio" - real day-to-day TRM movement is
// nowhere near this for USD/COP, so 15% is a generous sanity ceiling, not a
// realistic expectation.
const MAX_FX_VARIANCE_PERCENT = 0.15;

// Single receivable balance used by payment validation and the planning UI:
// frozen sale base/tax, less returns and financial credit notes, less cash
// already collected. This prevents collecting more than the accounting
// receivable after a post-sale adjustment.
export const getOrderPendingBalance = async (orderId, db = prisma) => {
    const [order, paidAgg, notes] = await Promise.all([
        db.order.findUnique({ where: { id: orderId }, select: { id: true, total: true, orderStatus: true, currencyCode: true, orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } } } }),
        db.orderPayment.aggregate({ where: { orderId }, _sum: { amount: true, exchangeRateDifference: true } }),
        db.electronicCreditNote.findMany({ where: { invoice: { orderId } }, select: { id: true } }),
    ]);
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");
    const entries = notes.length ? await db.journalEntry.findMany({ where: { sourceType: "credit_note_financial", sourceId: { in: notes.map((note) => note.id) } }, select: { lines: { where: { chartAccount: { code: "1305" } }, select: { credit: true } } } }) : [];
    const operationalTotal = order.orderDetails.reduce((sum, row) => sum + Number(row.total) + Number(row.taxAmount) - Number(row.refundAmount) - Number(row.returnedTaxAmount), 0);
    const creditReduction = entries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + Number(line.credit), 0), 0);
    const total = Math.max(Number((operationalTotal - creditReduction).toFixed(2)), 0);
    // A settleInFull payment's exchangeRateDifference never actually applied
    // against the receivable (see postOrderPaymentJournalEntry - only
    // `amount - exchangeRateDifference` cleared 1305) - net it back out here
    // so "pending" reflects the receivable, not the raw cash collected.
    // Always 0 for a COP order (exchangeRateDifference is always 0 there).
    const paid = Number(paidAgg._sum.amount || 0) - Number(paidAgg._sum.exchangeRateDifference || 0);
    const pending = Number((total - paid).toFixed(2));
    return { order, total, paid: Number(paid), pending };
};

export const listOrderPayments = async ({ accountId, orderId }) => {
    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId }, select: { id: true } });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "order_payment_order_not_found");

    return prisma.orderPayment.findMany({
        where: { orderId: order.id },
        include: { cashAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, username: true } } },
        orderBy: { paidAt: "desc" },
    });
};

export const registerOrderPayment = async ({ accountId, actorId, orderId, amount, cashAccountId, method, reference, settleInFull }) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "Payment amount must be greater than zero.", [], "", "order_payment_amount_invalid");
    }

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
                cashAccountId,
                method: method?.trim() || null,
                reference: reference?.trim() || null,
                createdById: actorId,
            },
        });

        const balanceAfter = await creditCashAccount(tx, { cashAccountId, amount: numericAmount });

        await recordCashMovement(tx, {
            cashAccountId,
            delta: numericAmount,
            balanceAfter,
            sourceType: "order_payment",
            sourceId: payment.id,
            reason: `Pago de pedido ${order.invoiceNo}`,
            createdById: actorId,
        });

        await postOrderPaymentJournalEntry(tx, {
            accountId,
            createdById: actorId,
            payment,
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
