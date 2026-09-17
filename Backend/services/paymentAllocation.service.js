import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { documentPaymentDetails } from "../utils/paymentAvailability.js";

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

const allocate = async ({ accountId, actorId, paymentId, documentId, amount, payable = false }) => {
    const value = money(amount);
    if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, "Allocation amount must be positive.", [], "", "payment_allocation_amount_invalid");
    return prisma.$transaction(async (tx) => {
        const paymentModel = payable ? tx.purchasePayment : tx.orderPayment;
        const allocationModel = payable ? tx.purchasePaymentAllocation : tx.orderPaymentAllocation;
        const payment = await paymentModel.findFirst({ where: { id: paymentId, createdById: accountId }, include: { allocations: true, ...(payable ? { purchase: { include: { purchaseDetails: true, retentions: true, payments: true } } } : { order: { include: { orderDetails: true, payments: true } } }) } });
        if (!payment) throw new ApiError(404, "Payment not found.", [], "", "payment_allocation_payment_not_found");
        // These models always represent a payment posted against a document.
        // A second allocation cannot consume the same cash a second time.
        if (payment.orderId || payment.purchaseId) throw new ApiError(409, "This payment is already applied to its original document.", [], "", "payment_allocation_already_applied");
        const document = payable ? payment.purchase : payment.order;
        if (!document || document.createdById !== accountId || document.id !== documentId) throw new ApiError(404, "Document not found.", [], "", "payment_allocation_document_not_found");
        const already = payment.allocations.reduce((s, row) => s + Number(row.amount), 0);
        if (money(already + value) > money(payment.amount)) throw new ApiError(422, "Allocation exceeds the payment balance.", [], "", "payment_allocation_payment_exceeded");
        const gross = document[payable ? "purchaseDetails" : "orderDetails"].reduce((s, row) => s + Number(row.total) + Number(row.taxAmount) - Number(row.refundAmount) - Number(row.returnedTaxAmount), 0);
        const withheld = payable ? document.retentions.reduce((s, row) => s + Number(row.withheldAmount) - Number(row.returnedWithheldAmount), 0) : 0;
        const total = money(Math.max(gross - withheld, 0));
        const paid = document.payments.reduce((s, row) => s + Number(row.amount), 0);
        const existing = await allocationModel.aggregate({ _sum: { amount: true }, where: { [payable ? "purchaseId" : "orderId"]: documentId } });
        if (money(Number(existing._sum.amount || 0) + value) > money(Math.max(total - paid, 0))) throw new ApiError(422, "Allocation exceeds the document balance.", [], "", "payment_allocation_document_exceeded");
        return allocationModel.create({ data: { [payable ? "purchasePaymentId" : "orderPaymentId"]: paymentId, [payable ? "purchaseId" : "orderId"]: documentId, amount: value, createdById: actorId } });
    }, { isolationLevel: "Serializable" });
};

export const allocateReceivable = (args) => allocate({ ...args, payable: false });
export const allocatePayable = (args) => allocate({ ...args, payable: true });

export const listOrderPaymentAllocations = ({ accountId, paymentId }) => prisma.orderPaymentAllocation.findMany({ where: { orderPaymentId: paymentId, createdById: accountId }, include: { order: { select: { id: true, invoiceNo: true, dueDate: true } } }, orderBy: { createdAt: "desc" } });
export const listPurchasePaymentAllocations = ({ accountId, paymentId }) => prisma.purchasePaymentAllocation.findMany({ where: { purchasePaymentId: paymentId, createdById: accountId }, include: { purchase: { select: { id: true, purchaseNo: true, dueDate: true } } }, orderBy: { createdAt: "desc" } });

export const listUnallocatedPayments = async ({ accountId, payable = false }) => {
    const rows = await (payable ? prisma.purchasePayment : prisma.orderPayment).findMany({ where: { createdById: accountId }, include: { allocations: { select: { amount: true } }, ...(payable ? { purchase: { select: { id: true, purchaseNo: true, supplier: { select: { id: true, name: true } } } } } : { order: { select: { id: true, invoiceNo: true, customer: { select: { id: true, name: true } } } } }) }, orderBy: { paidAt: "desc" } });
    return rows.map((payment) => ({
        ...documentPaymentDetails(payment),
        document: payable ? payment.purchase : payment.order,
    })).filter((payment) => payment.available > 0.005);
};
