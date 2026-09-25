import { prisma } from "../db/prisma.js";

// Single definition of what a sale still owes, shared by every place that
// used to compute it on its own (orderPayment.service.js's payment cap, the
// receivables planner, the cartera report, payment allocation, deterioro):
//   gross     = Σ details (total + IVA - devoluciones)
//   total     = gross - notas crédito financieras (their 1305 credits)
//   collected = Σ payments (amount - diferencia en cambio: only
//               `amount - exchangeRateDifference` ever cleared 1305)
//   written   = Σ castigos not reversed (ReceivableWriteOff)
//   pending   = total - collected - written
// Retenciones que el cliente practicó are already inside `amount` (they
// cleared 1305 in full), so they need no separate term.

const round2 = (value) => Number(Number(value || 0).toFixed(2));

export const computeOrderReceivable = ({ orderDetails = [], payments = [], creditReduction = 0, writtenOff = 0 }) => {
    const gross = orderDetails.reduce((sum, row) => sum + Number(row.total) + Number(row.taxAmount || 0) - Number(row.refundAmount || 0) - Number(row.returnedTaxAmount || 0), 0);
    const total = Math.max(round2(gross - Number(creditReduction || 0)), 0);
    const collected = round2(payments.reduce((sum, row) => sum + Number(row.amount) - Number(row.exchangeRateDifference || 0), 0));
    const written = round2(writtenOff);
    return { total, paid: collected, writtenOff: written, pending: round2(total - collected - written) };
};

// Per-order credit-note reductions and active write-offs, batched.
// `asOf` restricts both to what existed at that date (deterioro's cutoff).
export const loadReceivableAdjustments = async (orderIds, { db = prisma, asOf = null } = {}) => {
    const creditReduction = new Map();
    const writtenOff = new Map();
    if (!orderIds.length) return { creditReduction, writtenOff };
    const [notes, writeOffs] = await Promise.all([
        db.electronicCreditNote.findMany({ where: { invoice: { orderId: { in: orderIds } } }, select: { id: true, invoice: { select: { orderId: true } } } }),
        db.receivableWriteOff.findMany({
            where: {
                orderId: { in: orderIds },
                ...(asOf ? { writeOffDate: { lte: asOf }, OR: [{ reversedAt: null }, { reversedAt: { gt: asOf } }] } : { reversedAt: null }),
            },
            select: { orderId: true, amount: true },
        }),
    ]);
    if (notes.length) {
        const orderByNote = new Map(notes.map((note) => [note.id, note.invoice.orderId]));
        const entries = await db.journalEntry.findMany({
            where: { sourceType: "credit_note_financial", sourceId: { in: notes.map((note) => note.id) }, ...(asOf ? { entryDate: { lte: asOf } } : {}) },
            select: { sourceId: true, lines: { where: { chartAccount: { code: "1305" } }, select: { credit: true } } },
        });
        for (const entry of entries) {
            const orderId = orderByNote.get(entry.sourceId);
            const reduction = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
            creditReduction.set(orderId, round2((creditReduction.get(orderId) || 0) + reduction));
        }
    }
    for (const row of writeOffs) writtenOff.set(row.orderId, round2((writtenOff.get(row.orderId) || 0) + Number(row.amount)));
    return { creditReduction, writtenOff };
};
