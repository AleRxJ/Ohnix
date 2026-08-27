import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordCashMovement, creditCashAccount } from "./cashMovement.service.js";
import { postOrderPaymentJournalEntry } from "./accountingPosting.service.js";

// Cartera (accounts receivable): order.total - SUM(OrderPayment.amount) for
// that order. Deliberately not netted against OrderDetail.refundAmount here -
// a return is its own separate flow (stock/refund), not a payment; the
// cartera report can layer that in later if needed.
export const getOrderPendingBalance = async (orderId, db = prisma) => {
    const [order, paidAgg] = await Promise.all([
        db.order.findUnique({ where: { id: orderId }, select: { id: true, total: true, orderStatus: true } }),
        db.orderPayment.aggregate({ where: { orderId }, _sum: { amount: true } }),
    ]);
    if (!order) throw new ApiError(404, "Pedido no encontrado.");

    const paid = paidAgg._sum.amount || 0;
    const pending = Number(order.total) - Number(paid);
    return { order, paid: Number(paid), pending };
};

export const listOrderPayments = async ({ accountId, orderId }) => {
    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId }, select: { id: true } });
    if (!order) throw new ApiError(404, "Pedido no encontrado.");

    return prisma.orderPayment.findMany({
        where: { orderId: order.id },
        include: { cashAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, username: true } } },
        orderBy: { paidAt: "desc" },
    });
};

export const registerOrderPayment = async ({ accountId, actorId, orderId, amount, cashAccountId, method, reference }) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiError(400, "El monto del pago debe ser mayor a cero.");
    }

    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId } });
    if (!order) throw new ApiError(404, "Pedido no encontrado.");
    if (order.orderStatus === "cancelled") {
        throw new ApiError(400, "No se pueden registrar pagos sobre un pedido cancelado.");
    }

    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id: cashAccountId, createdById: accountId, isActive: true },
    });
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");

    try {
        return await prisma.$transaction(async (tx) => {
        const { pending } = await getOrderPendingBalance(orderId, tx);
        if (numericAmount > pending + 0.001) {
            throw new ApiError(422, `El pago (${numericAmount}) excede el saldo pendiente del pedido (${pending}).`);
        }

        const payment = await tx.orderPayment.create({
            data: {
                orderId,
                amount: numericAmount,
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
        });

        return payment;
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") {
            throw new ApiError(409, "El pago no pudo registrarse porque el saldo cambió. Intenta de nuevo.");
        }
        throw error;
    }
};
