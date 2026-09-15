import { prisma } from "../db/prisma.js";

export const listPaymentCredits = async ({ accountId, customerId, supplierId }) => prisma.paymentCreditBalance.findMany({
    where: { accountId, status: "open", ...(customerId ? { customerId } : {}), ...(supplierId ? { supplierId } : {}) },
    include: { customer: { select: { id: true, name: true, identification: true } }, supplier: { select: { id: true, name: true, identification: true } } },
    orderBy: { createdAt: "desc" },
});

export const getCreditBalance = async ({ accountId, id }) => prisma.paymentCreditBalance.findFirst({ where: { id, accountId }, include: { customer: true, supplier: true } });

export const applyCreditBalance = async ({ accountId, actorId, creditId, documentId, amount, payable = false }) => {
    const value = Math.round(Number(amount || 0) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0) throw new Error("Credit application amount must be positive.");
    return prisma.$transaction(async (tx) => {
        const credit = await tx.paymentCreditBalance.findFirst({ where: { id: creditId, accountId, status: "open" } });
        if (!credit) throw new Error("Payment credit is not available.");
        const remaining = Number(credit.amount) - Number(credit.appliedAmount);
        if (value > remaining + 0.001) throw new Error("Credit application exceeds the available balance.");
        const document = payable ? await tx.purchase.findFirst({ where: { id: documentId, createdById: accountId }, select: { id: true, supplierId: true } }) : await tx.order.findFirst({ where: { id: documentId, createdById: accountId }, select: { id: true, customerId: true } });
        if (!document) throw new Error("Document not found.");
        const ownerId = payable ? credit.supplierId : credit.customerId;
        if (ownerId !== (payable ? document.supplierId : document.customerId)) throw new Error("The credit and document belong to different third parties.");
        const sourcePaymentId = payable ? credit.sourcePurchasePaymentId : credit.sourceOrderPaymentId;
        if (!sourcePaymentId) throw new Error("Payment credit has no source payment.");
        const allocationModel = payable ? tx.purchasePaymentAllocation : tx.orderPaymentAllocation;
        const allocation = await allocationModel.create({ data: { [payable ? "purchaseId" : "orderId"]: documentId, [payable ? "purchasePaymentId" : "orderPaymentId"]: sourcePaymentId, amount: value, createdById: actorId } });
        await tx.paymentCreditBalance.update({ where: { id: credit.id }, data: { appliedAmount: Number((Number(credit.appliedAmount) + value).toFixed(2)), status: value >= remaining - 0.001 ? "applied" : "open" } });
        return allocation;
    }, { isolationLevel: "Serializable" });
};
