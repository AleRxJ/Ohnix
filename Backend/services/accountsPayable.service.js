import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { getAgingBucket, summarizeAging } from "../utils/accountAging.js";

const round2 = (value) => Number(Number(value).toFixed(2));

export const buildPayablePlan = ({ purchases, availableCash, now = new Date() }) => {
    const normalizedCash = Math.max(round2(availableCash), 0);
    const documents = purchases.map((purchase) => {
        const gross = purchase.purchaseDetails.reduce((sum, row) => sum + Number(row.total) + Number(row.taxAmount) - Number(row.refundAmount) - Number(row.returnedTaxAmount), 0);
        const withheld = purchase.retentions.reduce((sum, row) => sum + Number(row.withheldAmount) - Number(row.returnedWithheldAmount), 0);
        const paid = purchase.payments.reduce((sum, row) => sum + Number(row.amount), 0);
        const total = Math.max(round2(gross - withheld), 0);
        const pending = Math.max(round2(total - paid), 0);
        const due = purchase.dueDate ? new Date(purchase.dueDate) : null;
        const rawDays = due ? Math.floor((now - due) / 86400000) : null;
        const daysOverdue = rawDays === null ? null : Math.max(rawDays, 0);
        const status = rawDays === null ? "unscheduled" : rawDays > 0 ? "overdue" : rawDays >= -7 ? "due_soon" : "current";
        const paymentDetails = purchase.payments.map((payment) => ({ id: payment.id, amount: Number(payment.amount), allocated: round2((payment.allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount), 0)), available: round2(Number(payment.amount) - (payment.allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount), 0)), paid_at: payment.paidAt, method: payment.method, reference: payment.reference }));
        return { id: purchase.id, number: purchase.purchaseNo, document_date: purchase.purchaseDate, due_date: purchase.dueDate, supplier: purchase.supplier, total, paid: round2(paid), pending, payment_details: paymentDetails, days_overdue: daysOverdue, aging_bucket: getAgingBucket(rawDays), status };
    }).filter((row) => row.pending > 0.001);

    const rank = { overdue: 0, due_soon: 1, current: 2, unscheduled: 3 };
    documents.sort((a, b) => rank[a.status] - rank[b.status] || new Date(a.due_date || a.document_date) - new Date(b.due_date || b.document_date));
    let cashRemaining = normalizedCash;
    const planned = documents.map((row) => {
        const suggested = Math.min(row.pending, cashRemaining);
        cashRemaining = round2(cashRemaining - suggested);
        return { ...row, suggested_payment: round2(suggested), coverage: suggested >= row.pending ? "full" : suggested > 0 ? "partial" : "unfunded" };
    });
    const totalPending = round2(planned.reduce((sum, row) => sum + row.pending, 0));
    return { summary: { available_cash: normalizedCash, total_pending: totalPending, planned_payment: round2(Math.min(totalPending, normalizedCash)), remaining_cash: cashRemaining, funding_gap: round2(Math.max(totalPending - normalizedCash, 0)), document_count: planned.length, aging: summarizeAging(planned) }, documents: planned };
};

export const getAccountsPayablePlan = async ({ accountId, posScopeAll, posScopeIds }) => {
    const posWhere = posScopeAll ? {} : { pointOfSaleId: { in: posScopeIds || [] } };
    const [purchases, cashAccounts] = await Promise.all([
        prisma.purchase.findMany({
            where: { createdById: accountId, ...posWhere, purchaseStatus: { in: ["completed", "returned"] } },
            select: {
                id: true, purchaseNo: true, purchaseDate: true, dueDate: true,
                supplier: { select: { id: true, name: true, identification: true } },
                purchaseDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } },
                retentions: { select: { withheldAmount: true, returnedWithheldAmount: true } },
                payments: { select: { id: true, amount: true, paidAt: true, method: true, reference: true, allocations: { select: { amount: true } } } },
            },
        }),
        prisma.cashAccount.findMany({ where: { createdById: accountId, isActive: true, ...(posScopeAll ? {} : { OR: [{ pointOfSaleId: null }, { pointOfSaleId: { in: posScopeIds || [] } }] }) }, select: { balance: true } }),
    ]);
    return buildPayablePlan({ purchases, availableCash: cashAccounts.reduce((sum, row) => sum + Number(row.balance), 0) });
};

export const updatePurchaseDueDate = async ({ accountId, purchaseId, dueDate }) => {
    const parsed = dueDate ? new Date(dueDate) : null;
    if (parsed && Number.isNaN(parsed.getTime())) throw new ApiError(400, "The due date is invalid.", [], "", "payable_due_date_invalid");
    const purchase = await prisma.purchase.findFirst({ where: { createdById: accountId, OR: [{ id: purchaseId }, { legacyMongoId: purchaseId }] }, select: { id: true } });
    if (!purchase) throw new ApiError(404, "Purchase not found.", [], "", "payable_purchase_not_found");
    return prisma.purchase.update({ where: { id: purchase.id }, data: { dueDate: parsed }, select: { id: true, dueDate: true } });
};
