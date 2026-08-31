import { getChartAccountMap, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const getLineCostBasis = (line) => Number(line.costBasisApplied ?? line.buyingPrice ?? 0);
const round2 = (value) => Number(Number(value).toFixed(2));
export const buildAccountingThirdParty = (type, entity) => entity ? ({
    type,
    id: entity.id,
    name: entity.name,
    document: entity.identification || null,
}) : null;
const withThirdParty = (lines, thirdParty, controlAccountId) => {
    if (!thirdParty) return lines;
    const dimension = {
        thirdPartyType: thirdParty.type,
        thirdPartyId: thirdParty.id || null,
        thirdPartyName: thirdParty.name,
        thirdPartyDocument: thirdParty.document || null,
    };
    return lines.map((line) => line.chartAccountId === controlAccountId ? ({ ...line, ...dimension }) : line);
};

export const calculatePurchaseReturnValues = (lines) => {
    let refundBase = 0;
    let taxTotal = 0;
    let inventoryTotal = 0;
    for (const line of lines) {
        const lineTotal = Number(line.quantity) * Number(line.unitcost);
        refundBase += lineTotal;
        taxTotal += round2((lineTotal * Number(line.taxRateApplied)) / 100);
        inventoryTotal += Number(line.inventoryCostApplied ?? lineTotal);
    }
    refundBase = round2(refundBase);
    taxTotal = round2(taxTotal);
    inventoryTotal = round2(inventoryTotal);
    return { refundBase, taxTotal, inventoryTotal, variance: round2(refundBase - inventoryTotal) };
};

export const postInventoryAdjustmentJournalEntry = async (
    tx,
    { accountId, createdById, movementId, valueDelta, reason, entryDate = new Date() }
) => {
    const amount = Math.abs(round2(valueDelta));
    if (amount === 0) return null;
    const coa = await getChartAccountMap(tx, accountId);
    const increase = Number(valueDelta) > 0;
    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Ajuste de inventario: ${reason}`,
        sourceType: "inventory_adjustment",
        sourceId: movementId,
        lines: increase
            ? [
                  { chartAccountId: coa.get("1435").id, debit: amount, credit: 0 },
                  { chartAccountId: coa.get("4295").id, debit: 0, credit: amount },
              ]
            : [
                  { chartAccountId: coa.get("5195").id, debit: amount, credit: 0 },
                  { chartAccountId: coa.get("1435").id, debit: 0, credit: amount },
              ],
    });
};

export const postTransferDiscrepancyJournalEntry = async (
    tx,
    { accountId, createdById, transferId, amount, entryDate = new Date() }
) => {
    const loss = round2(amount);
    if (loss <= 0) return null;
    const coa = await getChartAccountMap(tx, accountId);
    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Faltante en traslado ${transferId}`,
        sourceType: "transfer_discrepancy",
        sourceId: transferId,
        lines: [
            { chartAccountId: coa.get("5195").id, debit: loss, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: loss },
        ],
    });
};

// The only file that knows "which PUC account, which side" for each of the
// 4 events this phase covers - order.service.js/purchase.service.js/
// orderPayment.service.js/purchasePayment.service.js each just make one
// clean call here instead of embedding chart-of-accounts knowledge inline.

export const postOrderSaleJournalEntry = async (tx, { accountId, createdById, order, cogs, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: order.orderDate,
        description: `Venta ${order.invoiceNo}`,
        sourceType: "order_sale",
        sourceId: order.id,
        lines: withThirdParty([
            { chartAccountId: coa.get("1305").id, debit: order.total, credit: 0 },
            { chartAccountId: coa.get("4135").id, debit: 0, credit: order.subTotal },
            { chartAccountId: coa.get("240805").id, debit: 0, credit: order.gst },
            { chartAccountId: coa.get("6135").id, debit: cogs, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: cogs },
        ], thirdParty, coa.get("1305").id),
    });
};

export const postPurchaseJournalEntry = async (tx, { accountId, createdById, purchase, totals, thirdParty }) => {
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
        lines: withThirdParty([
            { chartAccountId: coa.get("1435").id, debit: total, credit: 0 },
            { chartAccountId: coa.get("240810").id, debit: taxAmount, credit: 0 },
            { chartAccountId: coa.get("2205").id, debit: 0, credit: total + taxAmount },
        ], thirdParty, coa.get("2205").id),
    });
};

export const postOrderPaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, order, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de pedido ${order.invoiceNo}`,
        sourceType: "order_payment",
        sourceId: payment.id,
        lines: withThirdParty([
            { chartAccountId: cashChartAccountId, debit: payment.amount, credit: 0 },
            { chartAccountId: coa.get("1305").id, debit: 0, credit: payment.amount },
        ], thirdParty, coa.get("1305").id),
    });
};

export const postPurchasePaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, purchase, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de compra ${purchase.purchaseNo}`,
        sourceType: "purchase_payment",
        sourceId: payment.id,
        lines: withThirdParty([
            { chartAccountId: coa.get("2205").id, debit: payment.amount, credit: 0 },
            { chartAccountId: cashChartAccountId, debit: 0, credit: payment.amount },
        ], thirdParty, coa.get("2205").id),
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
export const postOrderReturnJournalEntry = async (tx, { accountId, createdById, sourceType, sourceId, entryDate, description, lines, thirdParty }) => {
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
        lines: withThirdParty([
            { chartAccountId: coa.get("1305").id, debit: 0, credit: refundTotal + taxTotal },
            { chartAccountId: coa.get("4135").id, debit: refundTotal, credit: 0 },
            { chartAccountId: coa.get("240805").id, debit: taxTotal, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: cogsTotal, credit: 0 },
            { chartAccountId: coa.get("6135").id, debit: 0, credit: cogsTotal },
        ], thirdParty, coa.get("1305").id),
    });
};

// Fase 4b - reversal for purchase_return. `lines`: [{ quantity, unitcost,
// taxRateApplied }] - no COGS/buyingPrice line, purchases have no
// cost-of-sale concept. Mirror-flip of postPurchaseJournalEntry: Dr
// Proveedores (reduce what's owed) / Cr Inventarios (goods out) / Cr IVA
// descontable (reduce credit claimed).
export const postPurchaseReturnJournalEntry = async (tx, { accountId, createdById, sourceId, entryDate, description, lines, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);

    const { refundBase: total, taxTotal, inventoryTotal, variance } = calculatePurchaseReturnValues(lines);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description,
        sourceType: "purchase_return",
        sourceId,
        lines: withThirdParty([
            { chartAccountId: coa.get("2205").id, debit: total + taxTotal, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: inventoryTotal },
            { chartAccountId: coa.get("240810").id, debit: 0, credit: taxTotal },
            ...(variance > 0
                ? [{ chartAccountId: coa.get("4295").id, debit: 0, credit: variance }]
                : variance < 0
                  ? [{ chartAccountId: coa.get("5195").id, debit: -variance, credit: 0 }]
                  : []),
        ], thirdParty, coa.get("2205").id),
    });
};
