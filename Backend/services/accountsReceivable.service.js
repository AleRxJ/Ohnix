import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const round2 = (value) => Number(Number(value).toFixed(2));

export const buildReceivablePlan = ({ orders, now = new Date() }) => {
    const documents = orders.map((order) => {
        const total = Math.max(round2(order.orderDetails.reduce((sum, row) => sum + Number(row.total) + Number(row.taxAmount) - Number(row.refundAmount) - Number(row.returnedTaxAmount), 0) - Number(order.financialCreditReduction || 0)), 0);
        const paid = round2(order.payments.reduce((sum, row) => sum + Number(row.amount), 0));
        const pending = Math.max(round2(total - paid), 0);
        const due = order.dueDate ? new Date(order.dueDate) : null;
        const rawDays = due ? Math.floor((now - due) / 86400000) : null;
        const status = rawDays === null ? "unscheduled" : rawDays > 0 ? "overdue" : rawDays >= -7 ? "due_soon" : "current";
        return { id: order.id, number: order.invoiceNo, document_date: order.orderDate, due_date: order.dueDate, customer: order.customer, total, paid, pending, days_overdue: rawDays === null ? null : Math.max(rawDays, 0), status };
    }).filter((row) => row.pending > 0.001);
    const rank = { overdue: 0, due_soon: 1, current: 2, unscheduled: 3 };
    documents.sort((a, b) => rank[a.status] - rank[b.status] || new Date(a.due_date || a.document_date) - new Date(b.due_date || b.document_date));
    const totals = (status) => round2(documents.filter((row) => !status || row.status === status).reduce((sum, row) => sum + row.pending, 0));
    return { summary: { total_pending: totals(), overdue: totals("overdue"), due_soon: totals("due_soon"), unscheduled: totals("unscheduled"), document_count: documents.length }, documents };
};

export const getAccountsReceivablePlan = async ({ accountId, posScopeAll, posScopeIds }) => {
    const orders = await prisma.order.findMany({
        where: { createdById: accountId, ...(posScopeAll ? {} : { pointOfSaleId: { in: posScopeIds || [] } }), orderStatus: { in: ["completed", "returned"] } },
        select: { id: true, invoiceNo: true, orderDate: true, dueDate: true, customer: { select: { id: true, name: true, identification: true, phone: true, email: true } }, orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } }, payments: { select: { amount: true } } },
    });
    const notes = orders.length ? await prisma.electronicCreditNote.findMany({ where: { invoice: { orderId: { in: orders.map((order) => order.id) } } }, select: { id: true, invoice: { select: { orderId: true } } } }) : [];
    const orderByNote = new Map(notes.map((note) => [note.id, note.invoice.orderId]));
    const entries = notes.length ? await prisma.journalEntry.findMany({ where: { sourceType: "credit_note_financial", sourceId: { in: notes.map((note) => note.id) } }, select: { sourceId: true, lines: { where: { chartAccount: { code: "1305" } }, select: { credit: true } } } }) : [];
    const reductionByOrder = new Map();
    for (const entry of entries) {
        const orderId = orderByNote.get(entry.sourceId);
        const reduction = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
        reductionByOrder.set(orderId, round2((reductionByOrder.get(orderId) || 0) + reduction));
    }
    return buildReceivablePlan({ orders: orders.map((order) => ({ ...order, financialCreditReduction: reductionByOrder.get(order.id) || 0 })) });
};

export const updateOrderDueDate = async ({ accountId, orderId, dueDate }) => {
    const parsed = dueDate ? new Date(dueDate) : null;
    if (parsed && Number.isNaN(parsed.getTime())) throw new ApiError(400, "Fecha de vencimiento inválida.");
    const order = await prisma.order.findFirst({ where: { createdById: accountId, OR: [{ id: orderId }, { legacyMongoId: orderId }] }, select: { id: true } });
    if (!order) throw new ApiError(404, "Pedido no encontrado.");
    return prisma.order.update({ where: { id: order.id }, data: { dueDate: parsed }, select: { id: true, dueDate: true } });
};
