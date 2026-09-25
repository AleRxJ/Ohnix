import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { buildAccountingThirdParty } from "./accountingPosting.service.js";
import { ensureImpairmentAccounts, getChartAccountMap } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { getOrderPendingBalance } from "./orderPayment.service.js";

// Castigo de cartera: giving up a specific invoice as uncollectible.
//   Dr 1399 deterioro acumulado (as far as the allowance reaches)
//   Dr 5199 gasto por deterioro (whatever the allowance didn't cover)
//   Cr 1305 clientes (the customer, as third party)
// Because the write-off is a ReceivableWriteOff row, receivableBalance.
// service.js takes it out of the order's pending balance everywhere - the
// planner, cartera, payment caps, deterioro's next run. If the customer pays
// after all, reverseWriteOff reinstates the receivable (Dr 1305 / Cr 4250
// recuperación) so the payment can be registered against it normally.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const withCustomer = (line, thirdParty) => (thirdParty ? { ...line, thirdPartyType: thirdParty.type, thirdPartyId: thirdParty.id || null, thirdPartyName: thirdParty.name, thirdPartyDocument: thirdParty.document || null } : line);

export const writeOffReceivable = async ({ accountId, actorId, orderId, amount, reason, writeOffDate }) => {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) throw new ApiError(400, "A reason is required.", [], "", "write_off_reason_required");
    const date = writeOffDate ? new Date(writeOffDate) : new Date();
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "The date is invalid.", [], "", "write_off_date_invalid");
    const order = await prisma.order.findFirst({ where: { id: orderId, createdById: accountId }, include: { customer: { select: { id: true, name: true, identification: true } } } });
    if (!order) throw new ApiError(404, "Order not found.", [], "", "write_off_order_not_found");

    try {
        return await prisma.$transaction(async (tx) => {
            const { pending } = await getOrderPendingBalance(orderId, tx);
            const value = amount === undefined || amount === null || amount === "" ? round2(pending) : round2(amount);
            if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, "The amount must be greater than zero.", [], "", "write_off_amount_invalid");
            if (value > round2(pending) + 0.001) throw new ApiError(422, "The write-off exceeds the invoice's pending balance.", [], "", "write_off_exceeds_pending");

            const accounts = await ensureImpairmentAccounts(tx, accountId);
            const coa = await getChartAccountMap(tx, accountId);
            const allowanceAgg = await tx.journalEntryLine.aggregate({ where: { chartAccountId: accounts.allowance.id }, _sum: { debit: true, credit: true } });
            const allowanceAvailable = Math.max(round2(Number(allowanceAgg._sum.credit || 0) - Number(allowanceAgg._sum.debit || 0)), 0);
            const allowanceUsed = round2(Math.min(allowanceAvailable, value));
            const expenseAmount = round2(value - allowanceUsed);
            const thirdParty = buildAccountingThirdParty("customer", order.customer);

            const row = await tx.receivableWriteOff.create({
                data: { createdById: accountId, orderId, amount: value, allowanceUsed, expenseAmount, writeOffDate: date, reason: trimmedReason, actorId },
            });
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: date,
                description: `Castigo de cartera ${order.invoiceNo}. ${trimmedReason}`,
                sourceType: "receivable_write_off",
                sourceId: row.id,
                lines: [
                    ...(allowanceUsed > 0 ? [{ chartAccountId: accounts.allowance.id, debit: allowanceUsed, credit: 0 }] : []),
                    ...(expenseAmount > 0 ? [{ chartAccountId: accounts.expense.id, debit: expenseAmount, credit: 0 }] : []),
                    withCustomer({ chartAccountId: coa.get("1305").id, debit: 0, credit: value }, thirdParty),
                ],
            });
            return tx.receivableWriteOff.update({ where: { id: row.id }, data: { journalEntryId: entry.id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The invoice changed in another session.", [], "", "write_off_concurrent_change");
        throw error;
    }
};

export const reverseWriteOff = async ({ accountId, actorId, id, reason, reversalDate }) => {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) throw new ApiError(400, "A reason is required.", [], "", "write_off_reason_required");
    const date = reversalDate ? new Date(reversalDate) : new Date();
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "The date is invalid.", [], "", "write_off_date_invalid");
    try {
        return await prisma.$transaction(async (tx) => {
            const row = await tx.receivableWriteOff.findFirst({ where: { id, createdById: accountId }, include: { order: { include: { customer: { select: { id: true, name: true, identification: true } } } } } });
            if (!row) throw new ApiError(404, "Write-off not found.", [], "", "write_off_not_found");
            if (row.reversedAt) throw new ApiError(409, "This write-off was already reversed.", [], "", "write_off_already_reversed");
            const accounts = await ensureImpairmentAccounts(tx, accountId);
            const coa = await getChartAccountMap(tx, accountId);
            const amount = round2(row.amount);
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: date,
                description: `Recuperación de cartera castigada ${row.order.invoiceNo}. ${trimmedReason}`,
                sourceType: "receivable_write_off_reversal",
                sourceId: row.id,
                lines: [
                    withCustomer({ chartAccountId: coa.get("1305").id, debit: amount, credit: 0 }, buildAccountingThirdParty("customer", row.order.customer)),
                    { chartAccountId: accounts.recovery.id, debit: 0, credit: amount },
                ],
            });
            const claim = await tx.receivableWriteOff.updateMany({ where: { id, reversedAt: null }, data: { reversedAt: date, reversalReason: trimmedReason, reversalEntryId: entry.id } });
            if (claim.count !== 1) throw new ApiError(409, "The write-off changed in another session.", [], "", "write_off_concurrent_change");
            return tx.receivableWriteOff.findUniqueOrThrow({ where: { id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The write-off changed in another session.", [], "", "write_off_concurrent_change");
        throw error;
    }
};

export const listWriteOffs = ({ accountId }) =>
    prisma.receivableWriteOff.findMany({
        where: { createdById: accountId },
        include: { order: { select: { id: true, invoiceNo: true, customer: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
