import { prisma } from "../db/prisma.js";
import { documentPaymentDetails } from "../utils/paymentAvailability.js";
import { ApiError } from "../utils/ApiError.js";
import { getAgingBucket, summarizeAging } from "../utils/accountAging.js";
import { computeOrderReceivable, loadReceivableAdjustments } from "./receivableBalance.service.js";

const round2 = (value) => Number(Number(value).toFixed(2));

export const buildReceivablePlan = ({ orders, now = new Date() }) => {
    const documents = orders.map((order) => {
        const balance = computeOrderReceivable({ orderDetails: order.orderDetails, payments: order.payments, creditReduction: order.financialCreditReduction, writtenOff: order.writtenOff });
        const { total, paid } = balance;
        const pending = Math.max(balance.pending, 0);
        const due = order.dueDate ? new Date(order.dueDate) : null;
        const rawDays = due ? Math.floor((now - due) / 86400000) : null;
        const status = rawDays === null ? "unscheduled" : rawDays > 0 ? "overdue" : rawDays >= -7 ? "due_soon" : "current";
        const paymentDetails = order.payments.map(documentPaymentDetails);
        return { id: order.id, number: order.invoiceNo, document_date: order.orderDate, due_date: order.dueDate, customer: order.customer, total, paid, written_off: balance.writtenOff, pending, payment_details: paymentDetails, days_overdue: rawDays === null ? null : Math.max(rawDays, 0), aging_bucket: getAgingBucket(rawDays), status };
    }).filter((row) => row.pending > 0.001);
    const rank = { overdue: 0, due_soon: 1, current: 2, unscheduled: 3 };
    documents.sort((a, b) => rank[a.status] - rank[b.status] || new Date(a.due_date || a.document_date) - new Date(b.due_date || b.document_date));
    const totals = (status) => round2(documents.filter((row) => !status || row.status === status).reduce((sum, row) => sum + row.pending, 0));
    return { summary: { total_pending: totals(), overdue: totals("overdue"), due_soon: totals("due_soon"), unscheduled: totals("unscheduled"), document_count: documents.length, aging: summarizeAging(documents) }, documents };
};

export const getAccountsReceivablePlan = async ({ accountId, posScopeAll, posScopeIds }) => {
    const orders = await prisma.order.findMany({
        where: { createdById: accountId, ...(posScopeAll ? {} : { pointOfSaleId: { in: posScopeIds || [] } }), orderStatus: { in: ["completed", "returned"] } },
        select: { id: true, invoiceNo: true, orderDate: true, dueDate: true, customer: { select: { id: true, name: true, identification: true, phone: true, email: true } }, orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } }, payments: { select: { id: true, amount: true, exchangeRateDifference: true, paidAt: true, method: true, reference: true, allocations: { select: { amount: true } } } } },
    });
    const { creditReduction, writtenOff } = await loadReceivableAdjustments(orders.map((order) => order.id));
    return buildReceivablePlan({ orders: orders.map((order) => ({ ...order, financialCreditReduction: creditReduction.get(order.id) || 0, writtenOff: writtenOff.get(order.id) || 0 })) });
};

export const updateOrderDueDate = async ({ accountId, orderId, dueDate }) => {
    const parsed = dueDate ? new Date(dueDate) : null;
    if (parsed && Number.isNaN(parsed.getTime())) throw new ApiError(400, "The due date is invalid.", [], "", "receivable_due_date_invalid");
    const order = await prisma.order.findFirst({ where: { createdById: accountId, OR: [{ id: orderId }, { legacyMongoId: orderId }] }, select: { id: true } });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "receivable_order_not_found");
    return prisma.order.update({ where: { id: order.id }, data: { dueDate: parsed }, select: { id: true, dueDate: true } });
};
