import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { ensureVatSettlementAccounts, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

// Liquidación de IVA. The report side (bases, rates, F300-style breakdown)
// already lives in report.controller.js#getVatReport; this is the
// accounting side it never had - the entry that closes a declared period's
// IVA accounts and the payment of the result to the DIAN.
//
// What gets swept is the CUMULATIVE balance of 240805/240810 at the period's
// cutoff, not just that period's activity: a purchase registered late with a
// date inside an already-settled period would otherwise sit on 240810
// forever. The next settlement picks it up, and the preview reports it
// separately as "ajustes de periodos anteriores" so the difference against
// the declaration is visible, not silent.
//
// Because of that, settlements must go in order: settling an earlier period
// after a later one would sweep balances the later one already included.

const MONTHS_PER_PERIOD = { bimonthly: 2, four_monthly: 4 };
const VAT_SOURCE_TYPES = ["vat_settlement", "vat_settlement_void", "vat_payment"];
const round2 = (value) => Number(Number(value || 0).toFixed(2));

export const getVatPeriodRange = (periodicity, year, periodNumber) => {
    const months = MONTHS_PER_PERIOD[periodicity];
    if (!months) throw new ApiError(400, "The IVA periodicity is invalid.", [], "", "vat_settlement_periodicity_invalid");
    const numericYear = Number(year);
    const numericPeriod = Number(periodNumber);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) throw new ApiError(400, "The year is invalid.", [], "", "vat_settlement_year_invalid");
    if (!Number.isInteger(numericPeriod) || numericPeriod < 1 || numericPeriod > 12 / months) throw new ApiError(400, "The IVA period is invalid.", [], "", "vat_settlement_period_invalid");
    const startMonth = (numericPeriod - 1) * months;
    return {
        year: numericYear,
        periodNumber: numericPeriod,
        startDate: new Date(Date.UTC(numericYear, startMonth, 1)),
        endDate: new Date(Date.UTC(numericYear, startMonth + months, 1) - 1),
    };
};

// generated = 240805 credit balance, deductible = 240810 debit balance,
// carryForward = 135520 debit balance (saldo a favor from earlier periods).
// Returns the entry lines keyed by account role, always balanced:
//   net > 0: Dr 240805 G / Cr 240810 D / Cr 135520 applied / Cr 240895 rest
//   net < 0: Dr 240805 G / Cr 240810 D / Dr 135520 |net|
// A negative G or D (returns exceeding sales/purchases) flips its side.
export const computeVatSettlement = ({ generated, deductible, carryForward = 0 }) => {
    const g = round2(generated);
    const d = round2(deductible);
    const carry = Math.max(0, round2(carryForward));
    const net = round2(g - d);
    const lines = [
        { role: "generated", debit: g > 0 ? g : 0, credit: g < 0 ? -g : 0 },
        { role: "deductible", debit: d < 0 ? -d : 0, credit: d > 0 ? d : 0 },
    ];
    let carryForwardApplied = 0;
    let netPayable = 0;
    let creditBalance = 0;
    if (net > 0) {
        carryForwardApplied = round2(Math.min(carry, net));
        netPayable = round2(net - carryForwardApplied);
        lines.push({ role: "credit", debit: 0, credit: carryForwardApplied });
        lines.push({ role: "payable", debit: 0, credit: netPayable });
    } else if (net < 0) {
        creditBalance = -net;
        lines.push({ role: "credit", debit: creditBalance, credit: 0 });
    }
    return { generated: g, deductible: d, net, carryForwardApplied, netPayable, creditBalance, availableCredit: carry, lines: lines.filter((line) => line.debit !== 0 || line.credit !== 0) };
};

const sumBalances = async (db, accounts, where) => {
    const rows = await db.journalEntryLine.groupBy({
        by: ["chartAccountId"],
        where: { chartAccountId: { in: Object.values(accounts).map((account) => account.id) }, journalEntry: where },
        _sum: { debit: true, credit: true },
    });
    const byId = new Map(rows.map((row) => [row.chartAccountId, round2(Number(row._sum.debit || 0) - Number(row._sum.credit || 0))]));
    const debitBalance = (role) => byId.get(accounts[role].id) || 0;
    return {
        generated: -debitBalance("generated"),
        deductible: debitBalance("deductible"),
        carryForward: debitBalance("credit"),
    };
};

const loadSettlementFigures = async (db, accountId, range) => {
    const accounts = await ensureVatSettlementAccounts(db, accountId);
    const [cumulative, activity] = await Promise.all([
        sumBalances(db, accounts, { entryDate: { lte: range.endDate } }),
        sumBalances(db, accounts, { entryDate: { gte: range.startDate, lte: range.endDate }, sourceType: { notIn: VAT_SOURCE_TYPES } }),
    ]);
    return { accounts, cumulative, activity };
};

// Blockers are returned (preview) or thrown (settle) - same list either way,
// so the UI can explain why the button is disabled before anyone clicks it.
const findBlockers = async (db, { accountId, periodicity, range, existing }) => {
    const blockers = [];
    if (existing && existing.status !== "voided") blockers.push("vat_settlement_already_exists");
    if (range.endDate > new Date()) blockers.push("vat_settlement_period_not_ended");
    const [overlapping, later] = await Promise.all([
        db.vatSettlement.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { lte: range.endDate }, endDate: { gte: range.startDate }, NOT: { periodicity, year: range.year, periodNumber: range.periodNumber } } }),
        db.vatSettlement.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { gt: range.endDate } } }),
    ]);
    if (overlapping) blockers.push("vat_settlement_overlap");
    if (later) blockers.push("vat_settlement_out_of_order");
    return blockers;
};

const BLOCKER_MESSAGES = {
    vat_settlement_already_exists: [409, "This IVA period is already settled."],
    vat_settlement_period_not_ended: [422, "The IVA period has not ended yet."],
    vat_settlement_overlap: [409, "Another settlement already covers part of this period."],
    vat_settlement_out_of_order: [409, "A later IVA period is already settled - void it first to settle this one."],
};

const findExisting = (db, accountId, periodicity, range) =>
    db.vatSettlement.findUnique({ where: { createdById_periodicity_year_periodNumber: { createdById: accountId, periodicity, year: range.year, periodNumber: range.periodNumber } } });

export const previewVatSettlement = async ({ accountId, periodicity, year, periodNumber }) => {
    const range = getVatPeriodRange(periodicity, year, periodNumber);
    const existing = await findExisting(prisma, accountId, periodicity, range);
    const [{ cumulative, activity }, blockers] = await Promise.all([
        loadSettlementFigures(prisma, accountId, range),
        findBlockers(prisma, { accountId, periodicity, range, existing }),
    ]);
    const result = computeVatSettlement(cumulative);
    return {
        range,
        existing,
        blockers,
        result,
        activity: { generated: round2(activity.generated), deductible: round2(activity.deductible) },
        priorAdjustments: {
            generated: round2(cumulative.generated - activity.generated),
            deductible: round2(cumulative.deductible - activity.deductible),
        },
    };
};

export const settleVatPeriod = async ({ accountId, actorId, periodicity, year, periodNumber }) => {
    const range = getVatPeriodRange(periodicity, year, periodNumber);
    try {
        return await prisma.$transaction(async (tx) => {
            const existing = await findExisting(tx, accountId, periodicity, range);
            const blockers = await findBlockers(tx, { accountId, periodicity, range, existing });
            if (blockers.length) {
                const [status, message] = BLOCKER_MESSAGES[blockers[0]];
                throw new ApiError(status, message, [], "", blockers[0]);
            }
            const { accounts, cumulative } = await loadSettlementFigures(tx, accountId, range);
            const result = computeVatSettlement(cumulative);
            const data = {
                startDate: range.startDate,
                endDate: range.endDate,
                generatedTotal: result.generated,
                deductibleTotal: result.deductible,
                carryForwardApplied: result.carryForwardApplied,
                netPayable: result.netPayable,
                creditBalance: result.creditBalance,
                status: "posted",
                settlementEntryId: null,
                paymentEntryId: null,
                paidCashAccountId: null,
                paidAt: null,
                voidedAt: null,
                voidReason: null,
                settledById: actorId,
            };
            // A voided row is reused so the (tenant, periodicity, year,
            // period) unique key keeps meaning "this period's declaration".
            const settlement = existing
                ? await tx.vatSettlement.update({ where: { id: existing.id }, data })
                : await tx.vatSettlement.create({ data: { ...data, createdById: accountId, periodicity, year: range.year, periodNumber: range.periodNumber } });
            const periodLabel = `${range.periodNumber}/${range.year} (${periodicity === "bimonthly" ? "bimestral" : "cuatrimestral"})`;
            // null when every line is zero - a declaración en ceros is still
            // a valid, recorded settlement, it just has nothing to post.
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: range.endDate,
                description: `Liquidación de IVA ${periodLabel}`,
                sourceType: "vat_settlement",
                sourceId: settlement.id,
                lines: result.lines.map((line) => ({ chartAccountId: accounts[line.role].id, debit: line.debit, credit: line.credit })),
            });
            return entry ? tx.vatSettlement.update({ where: { id: settlement.id }, data: { settlementEntryId: entry.id } }) : settlement;
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034" || error?.code === "P2002") throw new ApiError(409, "The IVA settlement changed in another session.", [], "", "vat_settlement_concurrent_change");
        throw error;
    }
};

export const voidVatSettlement = async ({ accountId, actorId, id, reason }) => {
    if (!String(reason || "").trim()) throw new ApiError(400, "A reason is required to void a settlement.", [], "", "vat_settlement_void_reason_required");
    try {
        return await prisma.$transaction(async (tx) => {
            const settlement = await tx.vatSettlement.findFirst({ where: { id, createdById: accountId } });
            if (!settlement) throw new ApiError(404, "IVA settlement not found.", [], "", "vat_settlement_not_found");
            if (settlement.status === "paid") throw new ApiError(409, "A paid settlement cannot be voided.", [], "", "vat_settlement_already_paid");
            if (settlement.status === "voided") throw new ApiError(409, "This settlement is already voided.", [], "", "vat_settlement_already_voided");
            const later = await tx.vatSettlement.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { gt: settlement.endDate } } });
            if (later) throw new ApiError(409, "Only the latest IVA settlement can be voided.", [], "", "vat_settlement_not_latest");

            if (settlement.settlementEntryId) {
                const original = await tx.journalEntry.findUnique({ where: { id: settlement.settlementEntryId }, include: { lines: true } });
                // Dated like the original, so the declared period's balances
                // go back to what they were before settling.
                await recordJournalEntry(tx, {
                    accountId,
                    createdById: actorId,
                    entryDate: original.entryDate,
                    description: `Anulación: ${original.description}. ${String(reason).trim()}`,
                    sourceType: "vat_settlement_void",
                    sourceId: settlement.id,
                    lines: original.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: Number(line.credit), credit: Number(line.debit) })),
                });
            }
            const claim = await tx.vatSettlement.updateMany({ where: { id, status: "posted" }, data: { status: "voided", voidedAt: new Date(), voidReason: String(reason).trim() } });
            if (claim.count !== 1) throw new ApiError(409, "The IVA settlement changed in another session.", [], "", "vat_settlement_concurrent_change");
            return tx.vatSettlement.findUniqueOrThrow({ where: { id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The IVA settlement changed in another session.", [], "", "vat_settlement_concurrent_change");
        throw error;
    }
};

export const payVatSettlement = async ({ accountId, actorId, id, cashAccountId, paymentDate }) => {
    const entryDate = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "The payment date is invalid.", [], "", "vat_payment_date_invalid");
    if (!cashAccountId) throw new ApiError(400, "A cash account is required.", [], "", "vat_payment_cash_account_required");
    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found or inactive.", [], "", "vat_payment_cash_account_not_found");

    try {
        return await prisma.$transaction(async (tx) => {
            const settlement = await tx.vatSettlement.findFirst({ where: { id, createdById: accountId } });
            if (!settlement) throw new ApiError(404, "IVA settlement not found.", [], "", "vat_settlement_not_found");
            if (settlement.status !== "posted") throw new ApiError(409, "Only a posted, unpaid settlement can be paid.", [], "", "vat_payment_not_payable");
            const amount = round2(settlement.netPayable);
            if (amount <= 0) throw new ApiError(422, "This settlement has nothing to pay.", [], "", "vat_payment_nothing_due");
            if (entryDate < settlement.endDate) throw new ApiError(422, "The payment cannot be dated before the period ends.", [], "", "vat_payment_date_before_period");

            const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount });
            if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "vat_payment_insufficient_balance");
            const [cashChartAccountId, accounts] = await Promise.all([
                resolveCashAccountChartAccount(tx, accountId, cashAccount),
                ensureVatSettlementAccounts(tx, accountId),
            ]);
            const periodLabel = `${settlement.periodNumber}/${settlement.year}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate,
                description: `Pago IVA ${periodLabel} a la DIAN`,
                sourceType: "vat_payment",
                sourceId: settlement.id,
                lines: [
                    { chartAccountId: accounts.payable.id, debit: amount, credit: 0 },
                    { chartAccountId: cashChartAccountId, debit: 0, credit: amount },
                ],
            });
            await recordCashMovement(tx, { cashAccountId, delta: -amount, balanceAfter, sourceType: "tax_payment", sourceId: settlement.id, reason: `Pago IVA ${periodLabel} a la DIAN`, createdById: actorId });
            const claim = await tx.vatSettlement.updateMany({ where: { id, status: "posted" }, data: { status: "paid", paidAt: entryDate, paymentEntryId: entry.id, paidCashAccountId: cashAccountId } });
            if (claim.count !== 1) throw new ApiError(409, "The IVA settlement changed in another session.", [], "", "vat_settlement_concurrent_change");
            return tx.vatSettlement.findUniqueOrThrow({ where: { id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The IVA settlement changed in another session.", [], "", "vat_settlement_concurrent_change");
        throw error;
    }
};

export const listVatSettlements = ({ accountId }) =>
    prisma.vatSettlement.findMany({ where: { createdById: accountId }, orderBy: [{ endDate: "desc" }] });

