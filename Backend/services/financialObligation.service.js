import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureLoanAccounts, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { claimCashAccount, creditCashAccount, recordCashMovement } from "./cashMovement.service.js";

// Obligaciones financieras: a loan with a fixed installment (sistema
// francés) from an effective annual rate.
//   - Each installment: Dr 2105 capital + Dr 530525 intereses / Cr banco.
//   - Causación: when an installment's due date passes unpaid, the daily
//     cron (loanInterestAccrualScheduler.js) accrues its interest
//     (Dr 530525 / Cr 233510 intereses por pagar), so the expense lands in
//     the month it was due; paying it later clears 233510 instead of
//     expensing again (any difference vs. what was accrued goes to 530525).
//   - Abono extraordinario: extra principal, then either the installment
//     is recomputed (reduce_installment) or the term shortens (reduce_term).
// The schedule is never stored: past rows are the actual payments, future
// rows are rebuilt from the real outstanding balance every time.
// The lender is posted as a third party (type "other", id = the
// obligation's id) so it shows up in the libro de terceros.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

export const monthlyRateFromAnnual = (annualRatePercent) => Math.pow(1 + Number(annualRatePercent) / 100, 1 / 12) - 1;

const annuity = (balance, monthlyRate, months) =>
    monthlyRate === 0 ? round2(balance / months) : round2((balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));

const addMonths = (date, months) => {
    const d = new Date(date);
    const day = d.getUTCDate();
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target;
};

// Rows from `startNumber` on, paying `installment` until the balance is 0 or
// `maxRows` is reached; the last row absorbs whatever is left so the
// balance always ends at exactly 0.
export const buildRemainingSchedule = ({ balance, monthlyRate, installment, startNumber, maxRows, firstPaymentDate }) => {
    const rows = [];
    let remaining = round2(balance);
    for (let k = 0; k < maxRows && remaining > 0; k++) {
        const number = startNumber + k;
        const interest = round2(remaining * monthlyRate);
        const isLast = k === maxRows - 1 || installment - interest >= remaining;
        const principalPart = isLast ? remaining : round2(installment - interest);
        remaining = round2(remaining - principalPart);
        rows.push({ number, due_date: addMonths(firstPaymentDate, number - 1), installment: round2(principalPart + interest), principal: principalPart, interest, balance_after: remaining });
    }
    return rows;
};

export const buildAmortizationSchedule = ({ principal, annualRate, termMonths, firstPaymentDate }) => {
    const i = monthlyRateFromAnnual(annualRate);
    const installment = annuity(round2(principal), i, termMonths);
    return { monthlyRate: i, installment, rows: buildRemainingSchedule({ balance: principal, monthlyRate: i, installment, startNumber: 1, maxRows: termMonths, firstPaymentDate }) };
};

// Current state from the obligation row and its payments.
export const deriveObligationState = (obligation, payments = []) => {
    const i = monthlyRateFromAnnual(obligation.annualRate);
    const original = annuity(round2(obligation.principal), i, obligation.termMonths);
    const installment = obligation.plannedInstallment != null ? round2(obligation.plannedInstallment) : original;
    const paidPrincipal = round2(payments.reduce((sum, p) => sum + Number(p.principal), 0));
    const outstanding = round2(Number(obligation.principal) - paidPrincipal);
    const future = obligation.status === "active" && outstanding > 0
        ? buildRemainingSchedule({ balance: outstanding, monthlyRate: i, installment, startNumber: obligation.installmentsPaid + 1, maxRows: Math.max(obligation.termMonths - obligation.installmentsPaid, 1), firstPaymentDate: obligation.firstPaymentDate })
        : [];
    return { monthlyRate: i, installment, outstanding, paidPrincipal, future, next: future[0] || null };
};

const include = {
    liabilityAccount: { select: { id: true, code: true, name: true } },
    interestAccount: { select: { id: true, code: true, name: true } },
    payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }] },
};

const lenderParty = (obligation) => ({ thirdPartyType: "other", thirdPartyId: obligation.id, thirdPartyName: obligation.lenderName });

const mapObligation = (row) => {
    const state = deriveObligationState(row, row.payments);
    const installments = row.payments.filter((p) => p.kind === "installment");
    const extras = row.payments.filter((p) => p.kind === "extra");
    const paidRows = installments.map((p) => ({
        number: p.installmentNumber,
        due_date: addMonths(row.firstPaymentDate, p.installmentNumber - 1),
        installment: round2(Number(p.principal) + Number(p.interest)),
        principal: Number(p.principal),
        interest: Number(p.interest),
        paid: true,
        paid_at: p.paidAt,
        paid_interest: Number(p.interest),
    }));
    return {
        _id: row.id,
        lender_name: row.lenderName,
        reference: row.reference,
        principal: Number(row.principal),
        annual_rate: Number(row.annualRate),
        monthly_rate_percent: round2(state.monthlyRate * 100 * 10000) / 10000,
        term_months: row.termMonths,
        disbursement_date: row.disbursementDate,
        first_payment_date: row.firstPaymentDate,
        installment: state.installment,
        installments_paid: row.installmentsPaid,
        interest_accrued_through: row.interestAccruedThrough,
        outstanding_principal: state.outstanding,
        paid_principal: state.paidPrincipal,
        paid_interest: round2(row.payments.reduce((sum, p) => sum + Number(p.interest), 0)),
        extra_payments: extras.map((p) => ({ _id: p.id, amount: Number(p.principal), paid_at: p.paidAt })),
        next_installment: state.next,
        status: row.status,
        disbursed_here: Boolean(row.disbursementEntryId),
        liability_account: row.liabilityAccount ? { _id: row.liabilityAccount.id, code: row.liabilityAccount.code, name: row.liabilityAccount.name } : undefined,
        interest_account: row.interestAccount ? { _id: row.interestAccount.id, code: row.interestAccount.code, name: row.interestAccount.name } : undefined,
        schedule: [...paidRows, ...state.future.map((r) => ({ ...r, paid: false, paid_at: null, paid_interest: null, accrued: r.number <= row.interestAccruedThrough }))],
        created_at: row.createdAt,
    };
};

export const listFinancialObligations = async (accountId) => {
    await ensureLoanAccounts(prisma, accountId);
    const rows = await prisma.financialObligation.findMany({ where: { createdById: accountId }, include, orderBy: [{ status: "asc" }, { disbursementDate: "desc" }] });
    return rows.map(mapObligation);
};

// Next unpaid installment of every active loan - for the accounts payable
// planner (accountsPayable.service.js) and the close-readiness warning.
export const listUpcomingInstallments = async (accountId, db = prisma) => {
    const rows = await db.financialObligation.findMany({ where: { createdById: accountId, status: "active" }, include: { payments: true } });
    return rows.map((row) => ({ obligation: row, next: deriveObligationState(row, row.payments).next })).filter((row) => row.next);
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

export const previewSchedule = (payload) => buildAmortizationSchedule(validateTerms(payload));

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
                { chartAccountId: liabilityAccount.id, debit: 0, credit: terms.principal, ...lenderParty(row) },
            ],
        });
        await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: terms.principal, balanceAfter, sourceType: "loan_disbursement", sourceId: row.id, reason: `Desembolso préstamo ${lenderName}`, createdById: actorId });
        return tx.financialObligation.update({ where: { id: row.id }, data: { disbursementCashAccountId: cashAccount.id, disbursementEntryId: entry.id } });
    }, { isolationLevel: "Serializable" });
    return mapObligation(await prisma.financialObligation.findUnique({ where: { id: created.id }, include }));
};

const loadForPayment = async (accountId, id, cashAccountId, paymentDate) => {
    const obligation = await prisma.financialObligation.findFirst({ where: { id, createdById: accountId }, include: { payments: true } });
    if (!obligation) throw new ApiError(404, "Financial obligation not found.", [], "", "loan_not_found");
    if (obligation.status !== "active") throw new ApiError(409, "This obligation is not active.", [], "", "loan_not_active");
    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "The cash account was not found or is inactive.", [], "", "loan_cash_account_unavailable");
    const paidAt = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new ApiError(400, "The payment date is invalid.", [], "", "loan_payment_date_invalid");
    return { obligation, cashAccount, paidAt };
};

// Pays the next installment. `interest` can be overridden for a
// variable-rate loan (the bank's statement is what counts); principal stays
// the scheduled one so the balance still ends at 0.
export const payNextInstallment = async (accountId, actorId, id, { cashAccountId, paymentDate, interest } = {}) => {
    const { obligation, cashAccount, paidAt } = await loadForPayment(accountId, id, cashAccountId, paymentDate);
    const state = deriveObligationState(obligation, obligation.payments);
    const row = state.next;
    if (!row) throw new ApiError(409, "Nothing is left to pay.", [], "", "loan_not_active");
    const interestAmount = interest !== undefined && interest !== null && interest !== "" ? round2(interest) : row.interest;
    if (!Number.isFinite(interestAmount) || interestAmount < 0) throw new ApiError(400, "The interest must be zero or more.", [], "", "loan_interest_invalid");
    const total = round2(row.principal + interestAmount);
    const lastOne = round2(state.outstanding - row.principal) <= 0;

    try {
        await prisma.$transaction(async (tx) => {
            const claim = await tx.financialObligation.updateMany({
                where: { id, installmentsPaid: obligation.installmentsPaid, status: "active" },
                data: { installmentsPaid: obligation.installmentsPaid + 1, interestAccruedThrough: Math.max(obligation.interestAccruedThrough, row.number), status: lastOne ? "paid" : "active" },
            });
            if (claim.count !== 1) throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
            const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: total });
            if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "loan_insufficient_balance");
            const [cashChartAccountId, accounts] = await Promise.all([resolveCashAccountChartAccount(tx, accountId, cashAccount), ensureLoanAccounts(tx, accountId)]);
            // Interest already accrued for this installment clears 233510;
            // only the difference (if the bank charged more or less) hits
            // the expense account now.
            const accrualEntry = await tx.journalEntry.findFirst({ where: { sourceType: "loan_interest_accrual", sourceId: `${obligation.id}:accrual:${row.number}` }, include: { lines: true } });
            const accrued = accrualEntry ? round2(accrualEntry.lines.filter((l) => l.chartAccountId === accounts.accruedInterest.id).reduce((s, l) => s + Number(l.credit), 0)) : 0;
            const difference = round2(interestAmount - accrued);
            const description = `Cuota ${row.number}/${obligation.termMonths} préstamo ${obligation.lenderName}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: paidAt,
                description,
                sourceType: "loan_payment",
                sourceId: `${obligation.id}:${row.number}`,
                lines: [
                    { chartAccountId: obligation.liabilityAccountId, debit: row.principal, credit: 0, ...lenderParty(obligation) },
                    ...(accrued > 0 ? [{ chartAccountId: accounts.accruedInterest.id, debit: accrued, credit: 0, ...lenderParty(obligation) }] : []),
                    ...(difference > 0 ? [{ chartAccountId: obligation.interestAccountId, debit: difference, credit: 0 }] : []),
                    ...(difference < 0 ? [{ chartAccountId: obligation.interestAccountId, debit: 0, credit: -difference }] : []),
                    { chartAccountId: cashChartAccountId, debit: 0, credit: total },
                ],
            });
            await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: -total, balanceAfter, sourceType: "loan_payment", sourceId: obligation.id, reason: description, createdById: actorId });
            await tx.financialObligationPayment.create({ data: { obligationId: id, kind: "installment", installmentNumber: row.number, principal: row.principal, interest: interestAmount, paidAt, cashAccountId: cashAccount.id, journalEntryId: entry.id, createdById: actorId } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034" || error?.code === "P2002") throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
        throw error;
    }
    return mapObligation(await prisma.financialObligation.findUnique({ where: { id }, include }));
};

// Abono extraordinario a capital.
export const computeExtraPaymentPlan = ({ obligation, outstanding, amount, strategy }) => {
    const i = monthlyRateFromAnnual(obligation.annualRate);
    const newOutstanding = round2(outstanding - amount);
    const remainingMonths = Math.max(obligation.termMonths - obligation.installmentsPaid, 1);
    if (newOutstanding <= 0) return { newOutstanding: 0, plannedInstallment: null, termMonths: obligation.termMonths, paidOff: true };
    const current = obligation.plannedInstallment != null ? round2(obligation.plannedInstallment) : annuity(round2(obligation.principal), i, obligation.termMonths);
    if (strategy === "reduce_term") {
        const rows = buildRemainingSchedule({ balance: newOutstanding, monthlyRate: i, installment: current, startNumber: obligation.installmentsPaid + 1, maxRows: remainingMonths, firstPaymentDate: obligation.firstPaymentDate });
        return { newOutstanding, plannedInstallment: current, termMonths: obligation.installmentsPaid + rows.length, paidOff: false };
    }
    return { newOutstanding, plannedInstallment: annuity(newOutstanding, i, remainingMonths), termMonths: obligation.termMonths, paidOff: false };
};

export const payExtraPrincipal = async (accountId, actorId, id, { cashAccountId, paymentDate, amount, strategy = "reduce_installment" } = {}) => {
    if (!["reduce_installment", "reduce_term"].includes(strategy)) throw new ApiError(400, "The strategy is invalid.", [], "", "loan_extra_strategy_invalid");
    const { obligation, cashAccount, paidAt } = await loadForPayment(accountId, id, cashAccountId, paymentDate);
    const value = round2(amount);
    const state = deriveObligationState(obligation, obligation.payments);
    if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, "The amount must be greater than zero.", [], "", "loan_extra_amount_invalid");
    if (value > state.outstanding + 0.001) throw new ApiError(422, "The payment exceeds the outstanding principal.", [], "", "loan_extra_exceeds_outstanding");
    const plan = computeExtraPaymentPlan({ obligation, outstanding: state.outstanding, amount: value, strategy });

    try {
        await prisma.$transaction(async (tx) => {
            const claim = await tx.financialObligation.updateMany({
                where: { id, installmentsPaid: obligation.installmentsPaid, status: "active", updatedAt: obligation.updatedAt },
                data: { plannedInstallment: plan.plannedInstallment, termMonths: plan.termMonths, status: plan.paidOff ? "paid" : "active" },
            });
            if (claim.count !== 1) throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
            const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: value });
            if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "loan_insufficient_balance");
            const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
            const description = `Abono extraordinario a capital préstamo ${obligation.lenderName}`;
            const entry = await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: paidAt,
                description,
                sourceType: "loan_extra_payment",
                sourceId: `${obligation.id}:extra:${randomUUID()}`,
                lines: [
                    { chartAccountId: obligation.liabilityAccountId, debit: value, credit: 0, ...lenderParty(obligation) },
                    { chartAccountId: cashChartAccountId, debit: 0, credit: value },
                ],
            });
            await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: -value, balanceAfter, sourceType: "loan_payment", sourceId: obligation.id, reason: description, createdById: actorId });
            await tx.financialObligationPayment.create({ data: { obligationId: id, kind: "extra", installmentNumber: null, principal: value, interest: 0, paidAt, cashAccountId: cashAccount.id, journalEntryId: entry.id, createdById: actorId } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034") throw new ApiError(409, "The obligation changed in another session.", [], "", "loan_concurrent_change");
        throw error;
    }
    return mapObligation(await prisma.financialObligation.findUnique({ where: { id }, include }));
};

// Daily: accrue the interest of every installment whose due date has passed
// unpaid. One entry per installment, deduped on interestAccruedThrough and
// the entry's sourceId.
export const accrueDueInterest = async ({ now = new Date() } = {}) => {
    const loans = await prisma.financialObligation.findMany({ where: { status: "active" }, include: { payments: true } });
    let posted = 0;
    let failed = 0;
    for (const loan of loans) {
        const due = deriveObligationState(loan, loan.payments).future.filter((row) => row.number > loan.interestAccruedThrough && row.due_date <= now && row.interest > 0);
        for (const row of due) {
            try {
                await prisma.$transaction(async (tx) => {
                    const claim = await tx.financialObligation.updateMany({ where: { id: loan.id, interestAccruedThrough: { lt: row.number }, installmentsPaid: { lt: row.number } }, data: { interestAccruedThrough: row.number } });
                    if (claim.count !== 1) return;
                    const accounts = await ensureLoanAccounts(tx, loan.createdById);
                    await recordJournalEntry(tx, {
                        accountId: loan.createdById,
                        createdById: loan.createdById,
                        entryDate: row.due_date,
                        description: `Causación intereses cuota ${row.number} préstamo ${loan.lenderName}`,
                        sourceType: "loan_interest_accrual",
                        sourceId: `${loan.id}:accrual:${row.number}`,
                        lines: [
                            { chartAccountId: loan.interestAccountId, debit: row.interest, credit: 0 },
                            { chartAccountId: accounts.accruedInterest.id, debit: 0, credit: row.interest, ...lenderParty(loan) },
                        ],
                    });
                }, { isolationLevel: "Serializable" });
                posted++;
            } catch {
                failed++;
            }
        }
    }
    return { checked: loans.length, posted, failed };
};
