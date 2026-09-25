import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureLoanAccounts, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";

// Obligaciones financieras: a loan with a fixed installment (sistema
// francés) from an effective annual rate. Interest is recognized when each
// installment is paid (Dr 2105 capital + Dr 530525 intereses / Cr banco) -
// the cash-basis simplification small businesses use; a month-end accrual
// of interest not yet paid isn't modeled.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

export const monthlyRateFromAnnual = (annualRatePercent) => Math.pow(1 + Number(annualRatePercent) / 100, 1 / 12) - 1;

const addMonths = (date, months) => {
    const d = new Date(date);
    const day = d.getUTCDate();
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target;
};

// Each row's interest is on the running balance; the last row absorbs the
// rounding so the balance ends at exactly 0.
export const buildAmortizationSchedule = ({ principal, annualRate, termMonths, firstPaymentDate }) => {
    const p = round2(principal);
    const i = monthlyRateFromAnnual(annualRate);
    const installment = i === 0 ? round2(p / termMonths) : round2((p * i) / (1 - Math.pow(1 + i, -termMonths)));
    const rows = [];
    let balance = p;
    for (let n = 1; n <= termMonths; n++) {
        const interest = round2(balance * i);
        const principalPart = n === termMonths ? balance : round2(Math.min(installment - interest, balance));
        const payment = round2(principalPart + interest);
        balance = round2(balance - principalPart);
        rows.push({ number: n, due_date: addMonths(firstPaymentDate, n - 1), installment: payment, principal: principalPart, interest, balance_after: balance });
    }
    return { monthlyRate: i, installment, rows };
};

const include = {
    liabilityAccount: { select: { id: true, code: true, name: true } },
    interestAccount: { select: { id: true, code: true, name: true } },
    payments: { orderBy: { installmentNumber: "asc" } },
};

const mapObligation = (row) => {
    const schedule = buildAmortizationSchedule(row);
    const paidPrincipal = round2(row.payments.reduce((sum, p) => sum + Number(p.principal), 0));
    const paidInterest = round2(row.payments.reduce((sum, p) => sum + Number(p.interest), 0));
    const next = row.status === "active" ? schedule.rows[row.installmentsPaid] || null : null;
    return {
        _id: row.id,
        lender_name: row.lenderName,
        reference: row.reference,
        principal: Number(row.principal),
        annual_rate: Number(row.annualRate),
        monthly_rate_percent: round2(schedule.monthlyRate * 100 * 10000) / 10000,
        term_months: row.termMonths,
        disbursement_date: row.disbursementDate,
        first_payment_date: row.firstPaymentDate,
        installment: schedule.installment,
        installments_paid: row.installmentsPaid,
        outstanding_principal: round2(Number(row.principal) - paidPrincipal),
        paid_principal: paidPrincipal,
        paid_interest: paidInterest,
        next_installment: next,
        status: row.status,
        disbursed_here: Boolean(row.disbursementEntryId),
        liability_account: row.liabilityAccount ? { _id: row.liabilityAccount.id, code: row.liabilityAccount.code, name: row.liabilityAccount.name } : undefined,
        interest_account: row.interestAccount ? { _id: row.interestAccount.id, code: row.interestAccount.code, name: row.interestAccount.name } : undefined,
        schedule: schedule.rows.map((r) => {
            const paid = row.payments.find((p) => p.installmentNumber === r.number);
            return { ...r, paid: Boolean(paid), paid_at: paid?.paidAt || null, paid_principal: paid ? Number(paid.principal) : null, paid_interest: paid ? Number(paid.interest) : null };
        }),
        created_at: row.createdAt,
    };
};

export const listFinancialObligations = async (accountId) => {
    await ensureLoanAccounts(prisma, accountId);
    const rows = await prisma.financialObligation.findMany({ where: { createdById: accountId }, include, orderBy: [{ status: "asc" }, { disbursementDate: "desc" }] });
    return rows.map(mapObligation);
};

export const previewSchedule = (payload) => {
    const data = validateTerms(payload);
    return buildAmortizationSchedule(data);
};

const validateTerms = (payload) => {
    const principal = round2(payload.principal);
    const annualRate = Number(payload.annual_rate);
    const termMonths = Number(payload.term_months);
    const disbursementDate = new Date(payload.disbursement_date);
    const firstPaymentDate = new Date(payload.first_payment_date);
    if (!Number.isFinite(principal) || principal <= 0) throw new ApiError(400, "The principal must be greater than zero.", [], "", "loan_principal_invalid");
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 200) throw new ApiError(400, "The annual rate must be between 0 and 200%.", [], "", "loan_rate_invalid");
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) throw new ApiError(400, "The term must be between 1 and 360 months.", [], "", "loan_term_invalid");
    if (Number.isNaN(disbursementDate.getTime())) throw new ApiError(400, "The disbursement date is invalid.", [], "", "loan_disbursement_date_invalid");
    if (Number.isNaN(firstPaymentDate.getTime()) || firstPaymentDate < disbursementDate) throw new ApiError(400, "The first payment date must be on or after the disbursement.", [], "", "loan_first_payment_date_invalid");
    return { principal, annualRate, termMonths, disbursementDate, firstPaymentDate };
};

// `cash_account_id` present = the disbursement is registered here (Dr bank
// / Cr 2105 + cash movement in); absent = the loan was already booked
// (e.g. through the opening balance) and this only tracks the schedule.
export const createFinancialObligation = async (accountId, actorId, payload) => {
    const lenderName = String(payload.lender_name || "").trim();
    if (!lenderName) throw new ApiError(400, "The lender is required.", [], "", "loan_lender_required");
    const terms = validateTerms(payload);
    const [liabilityAccount, interestAccount] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: payload.liability_account_id, createdById: accountId, accountType: "liability", isActive: true } }),
        prisma.chartAccount.findFirst({ where: { id: payload.interest_account_id, createdById: accountId, accountType: { in: ["expense", "cost"] }, isActive: true } }),
    ]);
    if (!liabilityAccount) throw new ApiError(404, "The liability account was not found or is inactive.", [], "", "loan_liability_account_unavailable");
    if (!interestAccount) throw new ApiError(404, "The interest account was not found or is inactive.", [], "", "loan_interest_account_unavailable");
    let cashAccount = null;
    if (payload.cash_account_id) {
        cashAccount = await prisma.cashAccount.findFirst({ where: { id: payload.cash_account_id, createdById: accountId, isActive: true } });
        if (!cashAccount) throw new ApiError(404, "The cash account was not found or is inactive.", [], "", "loan_cash_account_unavailable");
    }

    const created = await prisma.$transaction(async (tx) => {
        const row = await tx.financialObligation.create({
            data: { createdById: accountId, lenderName, reference: String(payload.reference || "").trim() || null, ...terms, liabilityAccountId: liabilityAccount.id, interestAccountId: interestAccount.id },
        });
        if (!cashAccount) return row;
        const balanceAfter = await creditCashAccount(tx, { cashAccountId: cashAccount.id, amount: terms.principal });
        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: terms.disbursementDate,
            description: `Desembolso préstamo ${lenderName}`,
            sourceType: "loan_disbursement",
            sourceId: row.id,
            lines: [
                { chartAccountId: cashChartAccountId, debit: terms.principal, credit: 0 },
                { chartAccountId: liabilityAccount.id, debit: 0, credit: terms.principal, thirdPartyType: "other", thirdPartyName: lenderName },
            ],
        });
        await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: terms.principal, balanceAfter, sourceType: "loan_disbursement", sourceId: row.id, reason: `Desembolso préstamo ${lenderName}`, createdById: actorId });
        return tx.financialObligation.update({ where: { id: row.id }, data: { disbursementCashAccountId: cashAccount.id, disbursementEntryId: entry.id } });
    }, { isolationLevel: "Serializable" });
    return mapObligation(await prisma.financialObligation.findUnique({ where: { id: created.id }, include }));
};

// Pays the next scheduled installment. `interest` can be overridden for a
// variable-rate loan (the bank's statement is what counts); principal stays
// the scheduled one so the balance still ends at 0.
export const payNextInstallment = async (accountId, actorId, id, { cashAccountId, paymentDate, interest } = {}) => {
    const obligation = await prisma.financialObligation.findFirst({ where: { id, createdById: accountId } });
    if (!obligation) throw new ApiError(404, "Financial obligation not found.", [], "", "loan_not_found");
    if (obligation.status !== "active") throw new ApiError(409, "This obligation is not active.", [], "", "loan_not_active");
    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "The cash account was not found or is inactive.", [], "", "loan_cash_account_unavailable");
    const paidAt = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new ApiError(400, "The payment date is invalid.", [], "", "loan_payment_date_invalid");

    const schedule = buildAmortizationSchedule(obligation);
    const row = schedule.rows[obligation.installmentsPaid];
    const interestAmount = interest !== undefined && interest !== null && interest !== "" ? round2(interest) : row.interest;
    if (!Number.isFinite(interestAmount) || interestAmount < 0) throw new ApiError(400, "The interest must be zero or more.", [], "", "loan_interest_invalid");
    const total = round2(row.principal + interestAmount);

    try {
        await prisma.$transaction(async (tx) => {
            const claim = await tx.financialObligation.updateMany({
                where: { id, installmentsPaid: obligation.installmentsPaid, status: "active" },
                data: { installmentsPaid: obligation.installmentsPaid + 1, status: row.number === obligation.termMonths ? "paid" : "active" },
            });
            if (claim.count !== 1) throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
            const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: total });
            if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "loan_insufficient_balance");
            const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
            const description = `Cuota ${row.number}/${obligation.termMonths} préstamo ${obligation.lenderName}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: paidAt,
                description,
                sourceType: "loan_payment",
                sourceId: `${obligation.id}:${row.number}`,
                lines: [
                    { chartAccountId: obligation.liabilityAccountId, debit: row.principal, credit: 0, thirdPartyType: "other", thirdPartyName: obligation.lenderName },
                    { chartAccountId: obligation.interestAccountId, debit: interestAmount, credit: 0 },
                    { chartAccountId: cashChartAccountId, debit: 0, credit: total },
                ],
            });
            await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: -total, balanceAfter, sourceType: "loan_payment", sourceId: obligation.id, reason: description, createdById: actorId });
            await tx.financialObligationPayment.create({ data: { obligationId: id, installmentNumber: row.number, principal: row.principal, interest: interestAmount, paidAt, cashAccountId: cashAccount.id, journalEntryId: entry.id, createdById: actorId } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034" || error?.code === "P2002") throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
        throw error;
    }
    return mapObligation(await prisma.financialObligation.findUnique({ where: { id }, include }));
};
