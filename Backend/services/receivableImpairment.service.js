import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { buildReceivablePlan } from "./accountsReceivable.service.js";
import { ensureImpairmentAccounts } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

// Deterioro de cartera (NIC 36/NIIF 9 simplified, and the fiscal "método
// general" of Decreto 187/1975 art. 74 as default rates). Each run brings
// 1399 (deterioro acumulado) to the provision the current aging requires:
// Dr 5199 / Cr 1399 when it has to grow, Dr 1399 / Cr 4250 (recuperación)
// when collections shrank it. Runs are snapshots; nothing here edits the
// receivables themselves (a castigo/write-off of a specific invoice is a
// separate, manual decision).

const round2 = (n) => Number((Number(n) || 0).toFixed(2));
export const IMPAIRMENT_BUCKETS = ["current", "d1_90", "d91_180", "d181_360", "over_360"];
export const DEFAULT_IMPAIRMENT_RATES = { current: 0, d1_90: 0, d91_180: 5, d181_360: 10, over_360: 15 };

// Days past due; a sale with no due date is treated as due on its own date
// (an unpaid sale without terms is owed immediately).
export const impairmentBucket = (daysPastDue) => {
    if (daysPastDue <= 0) return "current";
    if (daysPastDue <= 90) return "d1_90";
    if (daysPastDue <= 180) return "d91_180";
    if (daysPastDue <= 360) return "d181_360";
    return "over_360";
};

export const normalizeImpairmentRates = (rates = {}) => Object.fromEntries(IMPAIRMENT_BUCKETS.map((bucket) => {
    const value = rates?.[bucket] ?? DEFAULT_IMPAIRMENT_RATES[bucket];
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) throw new ApiError(400, "Each rate must be between 0 and 100.", [], "", "impairment_rate_invalid");
    return [bucket, numeric];
}));

export const computeImpairment = ({ documents, rates, asOfDate }) => {
    const bucketTotals = Object.fromEntries(IMPAIRMENT_BUCKETS.map((bucket) => [bucket, 0]));
    const rows = documents.map((doc) => {
        const due = new Date(doc.due_date || doc.document_date);
        const daysPastDue = Math.floor((asOfDate - due) / 86400000);
        const bucket = impairmentBucket(daysPastDue);
        bucketTotals[bucket] = round2(bucketTotals[bucket] + doc.pending);
        return { ...doc, days_past_due: Math.max(daysPastDue, 0), impairment_bucket: bucket, provision: round2(doc.pending * rates[bucket] / 100) };
    });
    const required = round2(IMPAIRMENT_BUCKETS.reduce((sum, bucket) => sum + round2(bucketTotals[bucket] * rates[bucket] / 100), 0));
    return { rows, bucketTotals, required };
};

const parseAsOf = (asOf) => {
    const date = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "The cutoff date is invalid.", [], "", "impairment_date_invalid");
    if (date > new Date(Date.now() + 86400000)) throw new ApiError(400, "The cutoff date cannot be in the future.", [], "", "impairment_date_future");
    return date;
};

// Receivables as they stood at the cutoff: sales dated on or before it,
// payments received on or before it (a later payment doesn't un-age a debt
// that was overdue at that date).
const loadReceivablesAsOf = async (db, accountId, asOfDate) => {
    const orders = await db.order.findMany({
        where: { createdById: accountId, orderStatus: { in: ["completed", "returned"] }, orderDate: { lte: asOfDate } },
        select: {
            id: true, invoiceNo: true, orderDate: true, dueDate: true,
            customer: { select: { id: true, name: true, identification: true } },
            orderDetails: { select: { total: true, taxAmount: true, refundAmount: true, returnedTaxAmount: true } },
            payments: { where: { paidAt: { lte: asOfDate } }, select: { id: true, amount: true, paidAt: true, method: true, reference: true, allocations: { select: { amount: true } } } },
        },
    });
    return buildReceivablePlan({ orders, now: asOfDate }).documents;
};

const allowanceBalance = async (db, allowanceId, asOfDate) => {
    const agg = await db.journalEntryLine.aggregate({ where: { chartAccountId: allowanceId, journalEntry: { entryDate: { lte: asOfDate } } }, _sum: { debit: true, credit: true } });
    return round2(Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0));
};

const evaluate = async (db, accountId, { asOf, rates }) => {
    const asOfDate = parseAsOf(asOf);
    const normalizedRates = normalizeImpairmentRates(rates);
    const accounts = await ensureImpairmentAccounts(db, accountId);
    const [documents, previous] = await Promise.all([loadReceivablesAsOf(db, accountId, asOfDate), allowanceBalance(db, accounts.allowance.id, asOfDate)]);
    const { rows, bucketTotals, required } = computeImpairment({ documents, rates: normalizedRates, asOfDate });
    return { asOfDate, rates: normalizedRates, accounts, rows, bucketTotals, required, previous, adjustment: round2(required - previous) };
};

export const previewImpairment = async ({ accountId, asOf, rates }) => {
    const result = await evaluate(prisma, accountId, { asOf, rates });
    return {
        as_of: result.asOfDate,
        rates: result.rates,
        bucket_totals: result.bucketTotals,
        total_receivable: round2(Object.values(result.bucketTotals).reduce((a, b) => a + b, 0)),
        required_provision: result.required,
        previous_provision: result.previous,
        adjustment: result.adjustment,
        documents: result.rows
            .filter((row) => row.provision > 0 || row.impairment_bucket !== "current")
            .sort((a, b) => b.days_past_due - a.days_past_due)
            .map((row) => ({ id: row.id, number: row.number, customer: row.customer, document_date: row.document_date, due_date: row.due_date, pending: row.pending, days_past_due: row.days_past_due, bucket: row.impairment_bucket, provision: row.provision })),
    };
};

export const runImpairment = async ({ accountId, actorId, asOf, rates }) => prisma.$transaction(async (tx) => {
    const result = await evaluate(tx, accountId, { asOf, rates });
    let entry = null;
    if (Math.abs(result.adjustment) >= 0.005) {
        const up = result.adjustment > 0;
        const amount = Math.abs(result.adjustment);
        entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: result.asOfDate,
            description: up ? "Deterioro de cartera" : "Recuperación de deterioro de cartera",
            sourceType: "receivable_impairment",
            sourceId: null,
            lines: up
                ? [{ chartAccountId: result.accounts.expense.id, debit: amount, credit: 0 }, { chartAccountId: result.accounts.allowance.id, debit: 0, credit: amount }]
                : [{ chartAccountId: result.accounts.allowance.id, debit: amount, credit: 0 }, { chartAccountId: result.accounts.recovery.id, debit: 0, credit: amount }],
        });
    }
    const run = await tx.receivableImpairmentRun.create({
        data: {
            createdById: accountId,
            asOfDate: result.asOfDate,
            rates: result.rates,
            bucketTotals: result.bucketTotals,
            requiredProvision: result.required,
            previousProvision: result.previous,
            adjustment: result.adjustment,
            journalEntryId: entry?.id || null,
            runById: actorId,
        },
    });
    if (entry) await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: run.id } });
    return run;
}, { isolationLevel: "Serializable" });

export const listImpairmentRuns = ({ accountId }) =>
    prisma.receivableImpairmentRun.findMany({ where: { createdById: accountId }, orderBy: { createdAt: "desc" }, take: 50 });
