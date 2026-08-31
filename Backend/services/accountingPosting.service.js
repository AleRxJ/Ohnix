import { getChartAccountMap, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const getLineCostBasis = (line) => Number(line.costBasisApplied ?? line.buyingPrice ?? 0);

// The only file that knows "which PUC account, which side" for each of the
// 4 events this phase covers - order.service.js/purchase.service.js/
// orderPayment.service.js/purchasePayment.service.js each just make one
// clean call here instead of embedding chart-of-accounts knowledge inline.

export const postOrderSaleJournalEntry = async (tx, { accountId, createdById, order, cogs }) => {
    const coa = await getChartAccountMap(tx, accountId);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: order.orderDate,
        description: `Venta ${order.invoiceNo}`,
        sourceType: "order_sale",
        sourceId: order.id,
        lines: [
            { chartAccountId: coa.get("1305").id, debit: order.total, credit: 0 },
            { chartAccountId: coa.get("4135").id, debit: 0, credit: order.subTotal },
            { chartAccountId: coa.get("240805").id, debit: 0, credit: order.gst },
            { chartAccountId: coa.get("6135").id, debit: cogs, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: cogs },
        ],
    });
};

export const postPurchaseJournalEntry = async (tx, { accountId, createdById, purchase, totals }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const total = Number(totals.total || 0);
    const taxAmount = Number(totals.taxAmount || 0);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: purchase.purchaseDate,
        description: `Compra ${purchase.purchaseNo}`,
        sourceType: "purchase",
        sourceId: purchase.id,
        lines: [
            { chartAccountId: coa.get("1435").id, debit: total, credit: 0 },
            { chartAccountId: coa.get("240810").id, debit: taxAmount, credit: 0 },
            { chartAccountId: coa.get("2205").id, debit: 0, credit: total + taxAmount },
        ],
    });
};

export const postOrderPaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, order }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de pedido ${order.invoiceNo}`,
        sourceType: "order_payment",
        sourceId: payment.id,
        lines: [
            { chartAccountId: cashChartAccountId, debit: payment.amount, credit: 0 },
            { chartAccountId: coa.get("1305").id, debit: 0, credit: payment.amount },
        ],
    });
};

export const postPurchasePaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, purchase }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de compra ${purchase.purchaseNo}`,
        sourceType: "purchase_payment",
        sourceId: payment.id,
        lines: [
            { chartAccountId: coa.get("2205").id, debit: payment.amount, credit: 0 },
            { chartAccountId: cashChartAccountId, debit: 0, credit: payment.amount },
        ],
    });
};

// Fase 4b - reversal for order_cancellation/order_return/credit_note_restock.
// `lines` is one entry per returned/cancelled OrderDetail line in this call:
// [{ quantity, unitcost, taxRateApplied, buyingPrice }]. Exact mirror-flip of
// postOrderSaleJournalEntry, line for line: Cr Clientes (reduce what's owed)
// / Dr Ingresos (reduce recorded revenue) / Dr IVA generado (reduce tax
// owed) / Dr Inventarios (goods back) / Cr Costo de ventas (reduce recorded
// cost) - same live-buyingPrice simplification as the forward posting (no
// historical cost layers anywhere in this codebase).
export const postOrderReturnJournalEntry = async (tx, { accountId, createdById, sourceType, sourceId, entryDate, description, lines }) => {
    const coa = await getChartAccountMap(tx, accountId);

    let refundTotal = 0;
    let taxTotal = 0;
    let cogsTotal = 0;
    for (const line of lines) {
        const lineRefund = line.quantity * Number(line.unitcost);
        refundTotal += lineRefund;
        taxTotal += Number(((lineRefund * Number(line.taxRateApplied)) / 100).toFixed(2));
        cogsTotal += line.quantity * getLineCostBasis(line);
    }
    refundTotal = Number(refundTotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    cogsTotal = Number(cogsTotal.toFixed(2));

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description,
        sourceType,
        sourceId,
        lines: [
            { chartAccountId: coa.get("1305").id, debit: 0, credit: refundTotal + taxTotal },
            { chartAccountId: coa.get("4135").id, debit: refundTotal, credit: 0 },
            { chartAccountId: coa.get("240805").id, debit: taxTotal, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: cogsTotal, credit: 0 },
            { chartAccountId: coa.get("6135").id, debit: 0, credit: cogsTotal },
        ],
    });
};

// Fase 4b - reversal for purchase_return. `lines`: [{ quantity, unitcost,
// taxRateApplied }] - no COGS/buyingPrice line, purchases have no
// cost-of-sale concept. Mirror-flip of postPurchaseJournalEntry: Dr
// Proveedores (reduce what's owed) / Cr Inventarios (goods out) / Cr IVA
// descontable (reduce credit claimed).
export const postPurchaseReturnJournalEntry = async (tx, { accountId, createdById, sourceId, entryDate, description, lines }) => {
    const coa = await getChartAccountMap(tx, accountId);

    let total = 0;
    let taxTotal = 0;
    for (const line of lines) {
        const lineTotal = line.quantity * Number(line.unitcost);
        total += lineTotal;
        taxTotal += Number(((lineTotal * Number(line.taxRateApplied)) / 100).toFixed(2));
    }
    total = Number(total.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description,
        sourceType: "purchase_return",
        sourceId,
        lines: [
            { chartAccountId: coa.get("2205").id, debit: total + taxTotal, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: total },
            { chartAccountId: coa.get("240810").id, debit: 0, credit: taxTotal },
        ],
    });
};
