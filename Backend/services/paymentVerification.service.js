import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// "Pagos por verificar" - nivel 1 of confirming that card/transfer money
// actually arrived. Payments the cashier typed in as card/transfer start
// `pending`; they become `verified` by hand, automatically when their
// CashMovement is reconciled against a bank statement line (see
// bankReconciliation.service.js#matchEntry), or directly when a provider
// confirmed them (Bold, paymentIntent.service.js). Scoped by account and,
// for restricted team members, by their own points of sale.

const scopeWhere = (user) => {
    const where = { order: { createdById: user.prismaId } };
    if (user.role !== "admin" && !user.posScopeAll) {
        where.order.pointOfSaleId = { in: user.posScopeIds || [] };
    }
    return where;
};

const mapVerification = (payment) => ({
    _id: payment.id,
    order_id: payment.order.legacyMongoId || payment.order.id,
    invoice_no: payment.order.invoiceNo,
    customer_name: payment.order.customer?.name || null,
    amount: Number(payment.amount),
    method: payment.method,
    reference: payment.reference,
    cash_account: payment.cashAccount ? { _id: payment.cashAccount.id, name: payment.cashAccount.name } : null,
    paid_at: payment.paidAt,
    verification_status: payment.verificationStatus,
    verification_source: payment.verificationSource,
    verified_at: payment.verifiedAt,
    verification_note: payment.verificationNote,
});

export const listPaymentVerifications = async ({ user, status = "pending", limit = 100 }) => {
    const statuses = String(status)
        .split(",")
        .filter((s) => ["pending", "verified", "rejected"].includes(s));
    const payments = await prisma.orderPayment.findMany({
        where: { ...scopeWhere(user), verificationStatus: { in: statuses.length ? statuses : ["pending"] } },
        include: {
            order: { select: { id: true, legacyMongoId: true, invoiceNo: true, customer: { select: { name: true } } } },
            cashAccount: { select: { id: true, name: true } },
        },
        orderBy: { paidAt: "desc" },
        take: Math.min(Number(limit) || 100, 300),
    });

    // Provider charges that were approved but couldn't be booked as-is -
    // real money waiting for a person, shown alongside.
    const intentsNeedingReview = await prisma.paymentIntent.findMany({
        where: {
            accountId: user.prismaId,
            status: "needs_review",
            ...(user.role !== "admin" && !user.posScopeAll ? { order: { pointOfSaleId: { in: user.posScopeIds || [] } } } : {}),
        },
        include: { order: { select: { id: true, legacyMongoId: true, invoiceNo: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
    });

    const pendingCount = await prisma.orderPayment.count({ where: { ...scopeWhere(user), verificationStatus: "pending" } });

    return {
        payments: payments.map(mapVerification),
        pending_count: pendingCount,
        intents_needing_review: intentsNeedingReview.map((i) => ({
            _id: i.id,
            order_id: i.order.legacyMongoId || i.order.id,
            invoice_no: i.order.invoiceNo,
            amount: Number(i.amount),
            mode: i.mode,
            provider_payment_id: i.providerPaymentId,
            last_error: i.lastError,
            updatedAt: i.updatedAt,
        })),
    };
};

export const setPaymentVerification = async ({ user, paymentId, status, note }) => {
    if (!["verified", "rejected", "pending"].includes(status)) {
        throw new ApiError(400, "status must be verified, rejected or pending.", [], "", "payment_verification_status_invalid");
    }
    if (status === "rejected" && !String(note || "").trim()) {
        throw new ApiError(400, "Explica por qué el pago no se encontró.", [], "", "payment_verification_note_required");
    }
    const payment = await prisma.orderPayment.findFirst({ where: { id: paymentId, ...scopeWhere(user) }, select: { id: true } });
    if (!payment) throw new ApiError(404, "Payment not found.", [], "", "payment_verification_not_found");

    const updated = await prisma.orderPayment.update({
        where: { id: payment.id },
        data: {
            verificationStatus: status,
            verificationSource: status === "pending" ? null : "manual",
            verifiedAt: status === "pending" ? null : new Date(),
            verifiedById: status === "pending" ? null : user.actorId,
            verificationNote: String(note || "").trim() || null,
        },
        include: {
            order: { select: { id: true, legacyMongoId: true, invoiceNo: true, customer: { select: { name: true } } } },
            cashAccount: { select: { id: true, name: true } },
        },
    });
    return mapVerification(updated);
};

// Called INSIDE bankReconciliation's match/unmatch transactions (tx), so the
// payment's verification moves together with the reconciliation link.
// Only touches payments that were waiting (or that reconciliation itself
// verified) - a manual or provider verification is never overwritten.
export const verifyPaymentFromReconciliation = async (tx, movement) => {
    if (movement?.sourceType !== "order_payment" || !movement.sourceId) return;
    await tx.orderPayment.updateMany({
        where: { id: movement.sourceId, verificationStatus: "pending" },
        data: { verificationStatus: "verified", verificationSource: "bank_reconciliation", verifiedAt: new Date() },
    });
};

export const unverifyPaymentFromReconciliation = async (tx, movement) => {
    if (movement?.sourceType !== "order_payment" || !movement.sourceId) return;
    await tx.orderPayment.updateMany({
        where: { id: movement.sourceId, verificationStatus: "verified", verificationSource: "bank_reconciliation" },
        data: { verificationStatus: "pending", verificationSource: null, verifiedAt: null },
    });
};
