import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { applyLocationCostCenter } from "./accountingPosting.service.js";
import { getChartAccountMap, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { getOrderPendingBalance } from "./orderPayment.service.js";
import { getPurchasePendingBalance } from "./purchasePayment.service.js";

const round2 = (value) => Math.round(Number(value) * 100) / 100;
const money = (amount) => {
    const value = round2(amount);
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value - Number(amount)) > 0.0001) {
        throw new ApiError(400, "Amount must be positive with at most two decimals.", [], "", "payment_credit_amount_invalid");
    }
    return value;
};
const accounts = async (tx, accountId, payable) => {
    const coa = await getChartAccountMap(tx, accountId);
    const advance = coa.get(payable ? "1330" : "2805");
    const control = coa.get(payable ? "2205" : "1305");
    if (!advance?.isActive || advance.accountType !== (payable ? "asset" : "liability") || !control?.isActive) {
        throw new ApiError(409, "Advance or control account is unavailable.", [], "", "payment_credit_chart_unavailable");
    }
    return { advance, control };
};
const dimension = (party, payable) => ({
    thirdPartyType: payable ? "supplier" : "customer", thirdPartyId: party.id,
    thirdPartyName: party.name, thirdPartyDocument: party.identification || null,
});

export const listPaymentCredits = async ({ accountId, customerId, supplierId }) => prisma.paymentCreditBalance.findMany({
    where: { accountId, status: "open", cashAccountId: { not: null }, sourceOrderPaymentId: null, sourcePurchasePaymentId: null,
        ...(customerId ? { customerId } : {}), ...(supplierId ? { supplierId } : {}) },
    include: { customer: { select: { id: true, name: true, identification: true } }, supplier: { select: { id: true, name: true, identification: true } },
        appliedOrderPayments: { select: { id: true, orderId: true, amount: true, paidAt: true } },
        appliedPurchasePayments: { select: { id: true, purchaseId: true, amount: true, paidAt: true } } },
    orderBy: { createdAt: "desc" },
});

export const getCreditBalance = async ({ accountId, id }) => prisma.paymentCreditBalance.findFirst({
    where: { id, accountId }, include: { customer: true, supplier: true, appliedOrderPayments: true, appliedPurchasePayments: true },
});

export const registerPaymentAdvance = async ({ accountId, actorId, customerId, supplierId, cashAccountId, amount, reference, payable = false }) => {
    const value = money(amount);
    const partyId = payable ? supplierId : customerId;
    if (!partyId) throw new ApiError(400, "Third party is required.", [], "", "payment_credit_party_required");
    const [party, cashAccount] = await Promise.all([
        payable ? prisma.supplier.findFirst({ where: { id: partyId, createdById: accountId } })
            : prisma.customer.findFirst({ where: { id: partyId, createdById: accountId } }),
        prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }),
    ]);
    if (!party) throw new ApiError(404, "Third party not found.", [], "", "payment_credit_party_not_found");
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "payment_credit_cash_not_found");
    try {
        return await prisma.$transaction(async (tx) => {
            const { advance } = await accounts(tx, accountId, payable);
            const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
            const balanceAfter = payable ? await claimCashAccount(tx, { cashAccountId, amount: value })
                : await creditCashAccount(tx, { cashAccountId, amount: value });
            if (balanceAfter === null) throw new ApiError(422, "Insufficient cash.", [], "", "payment_credit_insufficient_funds");
            const credit = await tx.paymentCreditBalance.create({ data: {
                accountId, createdById: actorId, cashAccountId, amount: value,
                ...(payable ? { supplierId: party.id } : { customerId: party.id }),
            } });
            const entry = await recordJournalEntry(tx, {
                accountId, createdById: actorId, entryDate: new Date(),
                description: `${payable ? "Anticipo a proveedor" : "Anticipo de cliente"}: ${party.name}${reference ? ` (${String(reference).trim()})` : ""}`,
                sourceType: payable ? "supplier_advance" : "customer_advance", sourceId: credit.id,
                lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, payable ? [
                    { chartAccountId: advance.id, debit: value, credit: 0, ...dimension(party, payable) },
                    { chartAccountId: cashChartAccountId, debit: 0, credit: value },
                ] : [
                    { chartAccountId: cashChartAccountId, debit: value, credit: 0 },
                    { chartAccountId: advance.id, debit: 0, credit: value, ...dimension(party, payable) },
                ]),
            });
            const movement = await recordCashMovement(tx, {
                cashAccountId, delta: payable ? -value : value, balanceAfter,
                sourceType: payable ? "supplier_advance" : "customer_advance", sourceId: credit.id,
                reason: entry.description, createdById: actorId,
            });
            return { credit, entry, movement };
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "Advance balance changed.", [], "", "payment_credit_concurrent_change");
        throw error;
    }
};

export const applyCreditBalance = async ({ accountId, actorId, creditId, documentId, amount, payable = false }) => {
    const value = money(amount);
    try {
        return await prisma.$transaction(async (tx) => {
            const credit = await tx.paymentCreditBalance.findFirst({ where: {
                id: creditId, accountId, status: "open", cashAccountId: { not: null },
                sourceOrderPaymentId: null, sourcePurchasePaymentId: null,
                ...(payable ? { supplierId: { not: null }, customerId: null } : { customerId: { not: null }, supplierId: null }),
            } });
            if (!credit) throw new ApiError(404, "Advance unavailable.", [], "", "payment_credit_not_found");
            const remaining = round2(Number(credit.amount) - Number(credit.appliedAmount));
            if (value > remaining) throw new ApiError(422, "Amount exceeds available advance.", [], "", "payment_credit_exceeds_available");
            const document = payable
                ? await tx.purchase.findFirst({ where: { id: documentId, createdById: accountId, purchaseStatus: { in: ["completed", "returned"] } }, include: { supplier: true } })
                : await tx.order.findFirst({ where: { id: documentId, createdById: accountId, orderStatus: { in: ["completed", "returned"] } }, include: { customer: true } });
            if (!document) throw new ApiError(404, "Document unavailable.", [], "", "payment_credit_document_not_found");
            const party = payable ? document.supplier : document.customer;
            if (party?.id !== (payable ? credit.supplierId : credit.customerId)) {
                throw new ApiError(422, "Third party does not match.", [], "", "payment_credit_party_mismatch");
            }
            const { pending } = payable ? await getPurchasePendingBalance(documentId, tx) : await getOrderPendingBalance(documentId, tx);
            if (value > round2(pending)) throw new ApiError(422, "Amount exceeds document balance.", [], "", "payment_credit_exceeds_document");
            const { advance, control } = await accounts(tx, accountId, payable);
            const updated = await tx.paymentCreditBalance.updateMany({
                where: { id: credit.id, accountId, status: "open", appliedAmount: credit.appliedAmount },
                data: { appliedAmount: round2(Number(credit.appliedAmount) + value), status: value === remaining ? "applied" : "open" },
            });
            if (updated.count !== 1) throw new ApiError(409, "Advance changed.", [], "", "payment_credit_concurrent_change");
            const paymentData = { cashAccountId: credit.cashAccountId, appliedCreditId: credit.id,
                amount: value, method: "advance", createdById: actorId };
            const payment = payable ? await tx.purchasePayment.create({ data: { ...paymentData, purchaseId: document.id } })
                : await tx.orderPayment.create({ data: { ...paymentData, orderId: document.id } });
            const entry = await recordJournalEntry(tx, {
                accountId, createdById: actorId, entryDate: new Date(),
                description: `${payable ? "Aplicación de anticipo a compra" : "Aplicación de anticipo a pedido"} ${payable ? document.purchaseNo : document.invoiceNo}`,
                sourceType: "payment_credit_application", sourceId: payment.id,
                lines: await applyLocationCostCenter(tx, accountId, document.pointOfSaleId, payable ? [
                    { chartAccountId: control.id, debit: value, credit: 0, ...dimension(party, payable) },
                    { chartAccountId: advance.id, debit: 0, credit: value, ...dimension(party, payable) },
                ] : [
                    { chartAccountId: advance.id, debit: value, credit: 0, ...dimension(party, payable) },
                    { chartAccountId: control.id, debit: 0, credit: value, ...dimension(party, payable) },
                ]),
            });
            return { payment, entry, credit: await tx.paymentCreditBalance.findUnique({ where: { id: credit.id } }) };
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "Advance or document balance changed.", [], "", "payment_credit_concurrent_change");
        throw error;
    }
};
