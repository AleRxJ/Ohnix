import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { ensureIcaAccounts, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { getIncomeStatement } from "./financialStatements.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

// Declaración de ICA (industria y comercio). Same lifecycle as
// vatSettlement.service.js - preview, settle (one entry dated the period's
// last day), pay, void the latest unpaid one - with ICA's own arithmetic:
//   base      = ingresos del periodo (ledger revenue) - exclusiones
//   ICA       = base x tarifa por mil (Company.icaRatePerThousand, overridable)
//   + avisos y tableros (15% del ICA, only if the company advertises)
//   + sobretasa bomberil (% del ICA set by each municipality)
//   - ReteICA que le practicaron (135518, capped at the total)
//   = saldo a pagar
// Dr 5117 total / Cr 135518 retenciones aplicadas / Cr 2412 por pagar.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));
const MONTHS = { annual: 12, bimonthly: 2 };

export const getIcaPeriodRange = (periodicity, year, periodNumber) => {
    const months = MONTHS[periodicity];
    if (!months) throw new ApiError(400, "The ICA periodicity is invalid.", [], "", "ica_periodicity_invalid");
    const y = Number(year);
    const n = Number(periodNumber);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new ApiError(400, "The year is invalid.", [], "", "ica_year_invalid");
    if (!Number.isInteger(n) || n < 1 || n > 12 / months) throw new ApiError(400, "The ICA period is invalid.", [], "", "ica_period_invalid");
    const startMonth = (n - 1) * months;
    return { year: y, periodNumber: n, startDate: new Date(Date.UTC(y, startMonth, 1)), endDate: new Date(Date.UTC(y, startMonth + months, 1) - 1) };
};

export const computeIcaDeclaration = ({ grossIncome, excludedIncome = 0, ratePerThousand, avisosTableros = false, bomberilPercent = 0, withheldIca = 0 }) => {
    const gross = round2(grossIncome);
    const excluded = Math.max(0, round2(excludedIncome));
    const taxableBase = Math.max(0, round2(gross - excluded));
    const icaTax = round2((taxableBase * Number(ratePerThousand)) / 1000);
    const avisos = avisosTableros ? round2(icaTax * 0.15) : 0;
    const bomberil = round2((icaTax * Number(bomberilPercent || 0)) / 100);
    const total = round2(icaTax + avisos + bomberil);
    const withheldApplied = round2(Math.min(Math.max(0, round2(withheldIca)), total));
    return { grossIncome: gross, excludedIncome: excluded, taxableBase, icaTax, avisosTableros: avisos, bomberilSurcharge: bomberil, total, withheldIcaApplied: withheldApplied, netPayable: round2(total - withheldApplied), availableWithheld: Math.max(0, round2(withheldIca)) };
};

const validateOptions = ({ excludedIncome, ratePerThousand, bomberilPercent }) => {
    const excluded = excludedIncome === undefined || excludedIncome === null || excludedIncome === "" ? 0 : Number(excludedIncome);
    if (!Number.isFinite(excluded) || excluded < 0) throw new ApiError(400, "Exclusions must be zero or more.", [], "", "ica_excluded_invalid");
    const bomberil = bomberilPercent === undefined || bomberilPercent === null || bomberilPercent === "" ? 0 : Number(bomberilPercent);
    if (!Number.isFinite(bomberil) || bomberil < 0 || bomberil > 100) throw new ApiError(400, "The bomberil surcharge must be between 0 and 100%.", [], "", "ica_bomberil_invalid");
    const rate = ratePerThousand === undefined || ratePerThousand === null || ratePerThousand === "" ? null : Number(ratePerThousand);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 50)) throw new ApiError(400, "The rate must be between 0 and 50 per thousand.", [], "", "ica_rate_invalid");
    return { excluded, bomberil, rate };
};

const loadFigures = async (db, accountId, range, options) => {
    const [accounts, account, income] = await Promise.all([
        ensureIcaAccounts(db, accountId),
        db.user.findUnique({ where: { id: accountId }, select: { company: { select: { icaRatePerThousand: true, icaMunicipalityCode: true, icaActivityCode: true } } } }),
        getIncomeStatement({ accountId, startDate: range.startDate, endDate: range.endDate }),
    ]);
    const company = account?.company || null;
    const rate = options.rate ?? (company?.icaRatePerThousand != null ? Number(company.icaRatePerThousand) : null);
    let withheld = 0;
    if (accounts.withheld) {
        const agg = await db.journalEntryLine.aggregate({ where: { chartAccountId: accounts.withheld.id, journalEntry: { entryDate: { lte: range.endDate } } }, _sum: { debit: true, credit: true } });
        withheld = round2(Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0));
    }
    const result = rate === null ? null : computeIcaDeclaration({ grossIncome: income.total_revenue, excludedIncome: options.excluded, ratePerThousand: rate, avisosTableros: options.avisosTableros, bomberilPercent: options.bomberil, withheldIca: withheld });
    return { accounts, company, rate, income, result };
};

const findBlockers = async (db, { accountId, periodicity, range, existing, rate }) => {
    const blockers = [];
    if (rate === null) blockers.push("ica_rate_missing");
    if (existing && existing.status !== "voided") blockers.push("ica_already_exists");
    if (range.endDate > new Date()) blockers.push("ica_period_not_ended");
    const [overlapping, later] = await Promise.all([
        db.icaDeclaration.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { lte: range.endDate }, endDate: { gte: range.startDate }, NOT: { periodicity, year: range.year, periodNumber: range.periodNumber } } }),
        db.icaDeclaration.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { gt: range.endDate } } }),
    ]);
    if (overlapping) blockers.push("ica_overlap");
    if (later) blockers.push("ica_out_of_order");
    return blockers;
};
const BLOCKER_MESSAGES = {
    ica_rate_missing: [422, "Set the ICA rate per thousand in the company tax settings first."],
    ica_already_exists: [409, "This ICA period is already declared."],
    ica_period_not_ended: [422, "The ICA period has not ended yet."],
    ica_overlap: [409, "Another declaration already covers part of this period."],
    ica_out_of_order: [409, "A later ICA period is already declared - void it first."],
};
const findExisting = (db, accountId, periodicity, range) =>
    db.icaDeclaration.findUnique({ where: { createdById_periodicity_year_periodNumber: { createdById: accountId, periodicity, year: range.year, periodNumber: range.periodNumber } } });

export const previewIcaDeclaration = async ({ accountId, periodicity, year, periodNumber, excludedIncome, ratePerThousand, avisosTableros, bomberilPercent }) => {
    const range = getIcaPeriodRange(periodicity, year, periodNumber);
    const options = { ...validateOptions({ excludedIncome, ratePerThousand, bomberilPercent }), avisosTableros: Boolean(avisosTableros) };
    const existing = await findExisting(prisma, accountId, periodicity, range);
    const figures = await loadFigures(prisma, accountId, range, options);
    const blockers = await findBlockers(prisma, { accountId, periodicity, range, existing, rate: figures.rate });
    return { range, existing, blockers, company: figures.company, ratePerThousand: figures.rate, revenueLines: figures.income.revenue, result: figures.result };
};

export const settleIcaDeclaration = async ({ accountId, actorId, periodicity, year, periodNumber, excludedIncome, ratePerThousand, avisosTableros, bomberilPercent }) => {
    const range = getIcaPeriodRange(periodicity, year, periodNumber);
    const options = { ...validateOptions({ excludedIncome, ratePerThousand, bomberilPercent }), avisosTableros: Boolean(avisosTableros) };
    try {
        return await prisma.$transaction(async (tx) => {
            const existing = await findExisting(tx, accountId, periodicity, range);
            const { accounts, rate, result } = await loadFigures(tx, accountId, range, options);
            const blockers = await findBlockers(tx, { accountId, periodicity, range, existing, rate });
            if (blockers.length) {
                const [status, message] = BLOCKER_MESSAGES[blockers[0]];
                throw new ApiError(status, message, [], "", blockers[0]);
            }
            const data = {
                startDate: range.startDate,
                endDate: range.endDate,
                grossIncome: result.grossIncome,
                excludedIncome: result.excludedIncome,
                taxableBase: result.taxableBase,
                ratePerThousand: rate,
                icaTax: result.icaTax,
                avisosTableros: result.avisosTableros,
                bomberilSurcharge: result.bomberilSurcharge,
                withheldIcaApplied: result.withheldIcaApplied,
                netPayable: result.netPayable,
                status: "posted",
                settlementEntryId: null,
                paymentEntryId: null,
                paidCashAccountId: null,
                paidAt: null,
                voidedAt: null,
                voidReason: null,
                settledById: actorId,
            };
            const declaration = existing
                ? await tx.icaDeclaration.update({ where: { id: existing.id }, data })
                : await tx.icaDeclaration.create({ data: { ...data, createdById: accountId, periodicity, year: range.year, periodNumber: range.periodNumber } });
            const label = periodicity === "annual" ? `${range.year}` : `${range.periodNumber}/${range.year}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: range.endDate,
                description: `Declaración de ICA ${label}`,
                sourceType: "ica_declaration",
                sourceId: declaration.id,
                lines: [
                    { chartAccountId: accounts.expense.id, debit: result.total, credit: 0 },
                    ...(result.withheldIcaApplied > 0 ? [{ chartAccountId: accounts.withheld.id, debit: 0, credit: result.withheldIcaApplied }] : []),
                    { chartAccountId: accounts.payable.id, debit: 0, credit: result.netPayable },
                ],
            });
            return entry ? tx.icaDeclaration.update({ where: { id: declaration.id }, data: { settlementEntryId: entry.id } }) : declaration;
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034" || error?.code === "P2002") throw new ApiError(409, "The ICA declaration changed in another session.", [], "", "ica_concurrent_change");
        throw error;
    }
};

export const voidIcaDeclaration = async ({ accountId, actorId, id, reason }) => {
    if (!String(reason || "").trim()) throw new ApiError(400, "A reason is required to void a declaration.", [], "", "ica_void_reason_required");
    try {
        return await prisma.$transaction(async (tx) => {
            const row = await tx.icaDeclaration.findFirst({ where: { id, createdById: accountId } });
            if (!row) throw new ApiError(404, "ICA declaration not found.", [], "", "ica_not_found");
            if (row.status === "paid") throw new ApiError(409, "A paid declaration cannot be voided.", [], "", "ica_already_paid");
            if (row.status === "voided") throw new ApiError(409, "This declaration is already voided.", [], "", "ica_already_voided");
            const later = await tx.icaDeclaration.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { gt: row.endDate } } });
            if (later) throw new ApiError(409, "Only the latest ICA declaration can be voided.", [], "", "ica_not_latest");
            if (row.settlementEntryId) {
                const original = await tx.journalEntry.findUnique({ where: { id: row.settlementEntryId }, include: { lines: true } });
                await recordJournalEntry(tx, {
                    accountId,
                    createdById: actorId,
                    entryDate: original.entryDate,
                    description: `Anulación: ${original.description}. ${String(reason).trim()}`,
                    sourceType: "ica_declaration_void",
                    sourceId: row.id,
                    lines: original.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: Number(line.credit), credit: Number(line.debit) })),
                });
            }
            const claim = await tx.icaDeclaration.updateMany({ where: { id, status: "posted" }, data: { status: "voided", voidedAt: new Date(), voidReason: String(reason).trim() } });
            if (claim.count !== 1) throw new ApiError(409, "The ICA declaration changed in another session.", [], "", "ica_concurrent_change");
            return tx.icaDeclaration.findUniqueOrThrow({ where: { id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The ICA declaration changed in another session.", [], "", "ica_concurrent_change");
        throw error;
    }
};

export const payIcaDeclaration = async ({ accountId, actorId, id, cashAccountId, paymentDate }) => {
    const entryDate = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) throw new ApiError(400, "The payment date is invalid.", [], "", "ica_payment_date_invalid");
    const cashAccount = cashAccountId ? await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } }) : null;
    if (!cashAccount) throw new ApiError(404, "Cash account not found or inactive.", [], "", "ica_payment_cash_account_not_found");
    try {
        return await prisma.$transaction(async (tx) => {
            const row = await tx.icaDeclaration.findFirst({ where: { id, createdById: accountId } });
            if (!row) throw new ApiError(404, "ICA declaration not found.", [], "", "ica_not_found");
            if (row.status !== "posted") throw new ApiError(409, "Only a posted, unpaid declaration can be paid.", [], "", "ica_payment_not_payable");
            const amount = round2(row.netPayable);
            if (amount <= 0) throw new ApiError(422, "This declaration has nothing to pay.", [], "", "ica_payment_nothing_due");
            if (entryDate < row.endDate) throw new ApiError(422, "The payment cannot be dated before the period ends.", [], "", "ica_payment_date_before_period");
            const balanceAfter = await claimCashAccount(tx, { cashAccountId, amount });
            if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "ica_payment_insufficient_balance");
            const [cashChartAccountId, accounts] = await Promise.all([resolveCashAccountChartAccount(tx, accountId, cashAccount), ensureIcaAccounts(tx, accountId)]);
            const label = row.periodicity === "annual" ? `${row.year}` : `${row.periodNumber}/${row.year}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate,
                description: `Pago ICA ${label}`,
                sourceType: "ica_payment",
                sourceId: row.id,
                lines: [{ chartAccountId: accounts.payable.id, debit: amount, credit: 0 }, { chartAccountId: cashChartAccountId, debit: 0, credit: amount }],
            });
            await recordCashMovement(tx, { cashAccountId, delta: -amount, balanceAfter, sourceType: "tax_payment", sourceId: row.id, reason: `Pago ICA ${label}`, createdById: actorId });
            const claim = await tx.icaDeclaration.updateMany({ where: { id, status: "posted" }, data: { status: "paid", paidAt: entryDate, paymentEntryId: entry.id, paidCashAccountId: cashAccountId } });
            if (claim.count !== 1) throw new ApiError(409, "The ICA declaration changed in another session.", [], "", "ica_concurrent_change");
            return tx.icaDeclaration.findUniqueOrThrow({ where: { id } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The ICA declaration changed in another session.", [], "", "ica_concurrent_change");
        throw error;
    }
};

export const listIcaDeclarations = ({ accountId }) =>
    prisma.icaDeclaration.findMany({ where: { createdById: accountId }, orderBy: [{ endDate: "desc" }] });


// Close-readiness warning (accountingPeriod.service.js), same idea as
// vatSettlement.service.js#findUnsettledVatPeriodEndingIn: closing the month
// that ends an undeclared ICA period would block posting its declaration.
// Only for companies that configured an ICA rate (the rest aren't ICA
// declarants here); periodicity from the latest declaration, annual if none.
export const findUnsettledIcaPeriodEndingIn = async ({ accountId, year, month, db = prisma }) => {
    const account = await db.user.findUnique({ where: { id: accountId }, select: { company: { select: { icaRatePerThousand: true } } } });
    if (account?.company?.icaRatePerThousand == null) return null;
    const latest = await db.icaDeclaration.findFirst({ where: { createdById: accountId, status: { not: "voided" } }, orderBy: { endDate: "desc" }, select: { periodicity: true } });
    const periodicity = latest?.periodicity || "annual";
    const months = MONTHS[periodicity];
    if (month % months !== 0) return null;
    const range = getIcaPeriodRange(periodicity, year, month / months);
    const declared = await db.icaDeclaration.findFirst({ where: { createdById: accountId, status: { not: "voided" }, startDate: { lte: range.endDate }, endDate: { gte: range.startDate } }, select: { id: true } });
    if (declared) return null;
    const income = await getIncomeStatement({ accountId, startDate: range.startDate, endDate: range.endDate });
    return income.total_revenue > 0 ? { periodicity, year: range.year, period_number: range.periodNumber } : null;
};
