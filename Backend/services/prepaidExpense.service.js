import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensurePrepaidExpenseAccount, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";

// Diferidos / gastos pagados por anticipado. Same shape and cron idiom as
// fixedAsset.service.js (straight line, last month trues up the rounding,
// lastAmortizedPeriod as the dedupe key), with one difference: a run posts
// EVERY month that's due but not yet amortized, in one entry, instead of
// just the current one. A diferido registered today with a start month in
// the past (the usual case - "we paid the annual insurance in July") would
// otherwise finish months late.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const include = {
    assetAccount: { select: { id: true, code: true, name: true } },
    expenseAccount: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
};

const periodIndex = (period) => {
    const match = PERIOD_PATTERN.exec(period || "");
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
};
const periodFromIndex = (index) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

// Cumulative amount that should have been expensed after `n` months - the
// final month lands exactly on the total, never a few cents short or over.
export const amortizedTarget = ({ totalAmount, months }, n) => {
    const total = round2(totalAmount);
    if (n <= 0) return 0;
    if (n >= months) return total;
    return round2(round2(total / months) * n);
};

// How many months are due by `currentPeriod` and what the next run posts.
export const computeAmortizationDue = (expense, currentPeriod) => {
    const start = periodIndex(expense.startPeriod);
    const current = periodIndex(currentPeriod);
    const due = Math.max(0, Math.min(expense.months, current - start + 1));
    const pendingMonths = Math.max(0, due - expense.monthsAmortized);
    const amount = round2(amortizedTarget(expense, expense.monthsAmortized + pendingMonths) - amortizedTarget(expense, expense.monthsAmortized));
    return {
        dueMonths: due,
        pendingMonths,
        amount,
        fromPeriod: pendingMonths ? periodFromIndex(start + expense.monthsAmortized) : null,
        toPeriod: pendingMonths ? periodFromIndex(start + expense.monthsAmortized + pendingMonths - 1) : null,
    };
};

const mapPrepaidExpense = (row, currentPeriod) => {
    const amortized = amortizedTarget(row, row.monthsAmortized);
    const due = currentPeriod && row.status === "active" ? computeAmortizationDue(row, currentPeriod) : null;
    const start = periodIndex(row.startPeriod);
    return {
        _id: row.id,
        name: row.name,
        description: row.description,
        total_amount: Number(row.totalAmount),
        months: row.months,
        start_period: row.startPeriod,
        end_period: periodFromIndex(start + row.months - 1),
        monthly_amount: round2(Number(row.totalAmount) / row.months),
        months_amortized: row.monthsAmortized,
        amortized_amount: amortized,
        remaining_amount: round2(Number(row.totalAmount) - amortized),
        pending_months: due?.pendingMonths || 0,
        pending_amount: due?.amount || 0,
        status: row.status,
        funded_here: Boolean(row.fundingEntryId),
        last_amortized_period: row.lastAmortizedPeriod,
        last_run_status: row.lastRunStatus,
        last_run_error: row.lastRunError,
        cancelled_at: row.cancelledAt,
        cancel_reason: row.cancelReason,
        asset_account: row.assetAccount ? { _id: row.assetAccount.id, code: row.assetAccount.code, name: row.assetAccount.name } : undefined,
        expense_account: row.expenseAccount ? { _id: row.expenseAccount.id, code: row.expenseAccount.code, name: row.expenseAccount.name } : undefined,
        cost_center: row.costCenter ? { _id: row.costCenter.id, code: row.costCenter.code, name: row.costCenter.name } : undefined,
        created_at: row.createdAt,
    };
};

// Same "America/Bogota by default" calendar month as fixedAsset.service.js.
export const currentPeriod = () => {
    const tz = (() => {
        const candidate = process.env.TIMEZONE || "America/Bogota";
        try { Intl.DateTimeFormat("en-US", { timeZone: candidate }); return candidate; } catch { return "UTC"; }
    })();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
};

export const listPrepaidExpenses = async (accountId, { includeInactive = false } = {}) => {
    await ensurePrepaidExpenseAccount(prisma, accountId);
    const rows = await prisma.prepaidExpense.findMany({
        where: { createdById: accountId, ...(includeInactive ? {} : { status: "active" }) },
        include,
        orderBy: [{ status: "asc" }, { startPeriod: "desc" }],
    });
    const period = currentPeriod();
    return rows.map((row) => mapPrepaidExpense(row, period));
};

const validateAccounts = async (accountId, payload) => {
    const [assetAccount, expenseAccount] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: payload.asset_account_id, createdById: accountId, accountType: "asset", isActive: true } }),
        prisma.chartAccount.findFirst({ where: { id: payload.expense_account_id, createdById: accountId, accountType: { in: ["expense", "cost"] }, isActive: true } }),
    ]);
    if (!assetAccount) throw new ApiError(404, "The prepaid asset account was not found or is inactive.", [], "", "prepaid_asset_account_unavailable");
    if (!expenseAccount) throw new ApiError(404, "The expense account was not found or is inactive.", [], "", "prepaid_expense_account_unavailable");
    if (payload.cost_center_id) {
        const costCenter = await prisma.costCenter.findFirst({ where: { id: payload.cost_center_id, accountId, isActive: true } });
        if (!costCenter) throw new ApiError(400, "The selected cost center does not exist or is inactive.", [], "", "prepaid_cost_center_invalid");
    }
    return { assetAccountId: assetAccount.id, expenseAccountId: expenseAccount.id, costCenterId: payload.cost_center_id || null };
};

const validateSchedule = (payload) => {
    const totalAmount = round2(payload.total_amount);
    const months = Number(payload.months);
    const startPeriod = String(payload.start_period || "");
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new ApiError(400, "The amount must be greater than zero.", [], "", "prepaid_amount_invalid");
    if (!Number.isInteger(months) || months < 1 || months > 120) throw new ApiError(400, "The term must be between 1 and 120 months.", [], "", "prepaid_months_invalid");
    if (periodIndex(startPeriod) === null) throw new ApiError(400, "The start month is invalid.", [], "", "prepaid_start_period_invalid");
    return { totalAmount, months, startPeriod };
};

const validateName = (payload) => {
    const name = String(payload.name || "").trim();
    if (!name) throw new ApiError(400, "A name is required.", [], "", "prepaid_name_required");
    if (name.length > 160) throw new ApiError(400, "The name is too long.", [], "", "prepaid_name_too_long");
    return { name, description: String(payload.description || "").trim() || null };
};

// `cash_account_id` present = the payment happens here too (Dr 1705 /
// Cr bank + the cash movement); absent = it was already booked elsewhere
// (a purchase, a manual voucher) and this only schedules the amortization.
export const createPrepaidExpense = async (accountId, actorId, payload) => {
    const data = { ...validateName(payload), ...validateSchedule(payload), ...(await validateAccounts(accountId, payload)) };
    let cashAccount = null;
    if (payload.cash_account_id) {
        cashAccount = await prisma.cashAccount.findFirst({ where: { id: payload.cash_account_id, createdById: accountId, isActive: true } });
        if (!cashAccount) throw new ApiError(404, "The cash account was not found or is inactive.", [], "", "prepaid_cash_account_unavailable");
    }
    const paymentDate = payload.payment_date ? new Date(payload.payment_date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) throw new ApiError(400, "The payment date is invalid.", [], "", "prepaid_payment_date_invalid");

    const row = await prisma.$transaction(async (tx) => {
        const created = await tx.prepaidExpense.create({ data: { createdById: accountId, ...data } });
        if (!cashAccount) return created;
        const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: data.totalAmount });
        if (balanceAfter === null) throw new ApiError(422, "The cash account does not have enough balance.", [], "", "prepaid_insufficient_balance");
        const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: paymentDate,
            description: `Pago diferido: ${data.name}`,
            sourceType: "prepaid_expense",
            sourceId: created.id,
            lines: [
                { chartAccountId: data.assetAccountId, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
                { chartAccountId: cashChartAccountId, debit: 0, credit: data.totalAmount },
            ],
        });
        await recordCashMovement(tx, { cashAccountId: cashAccount.id, delta: -data.totalAmount, balanceAfter, sourceType: "prepaid_expense", sourceId: created.id, reason: `Pago diferido: ${data.name}`, createdById: actorId });
        return tx.prepaidExpense.update({ where: { id: created.id }, data: { fundingCashAccountId: cashAccount.id, fundingEntryId: entry.id } });
    }, { isolationLevel: "Serializable" });
    const full = await prisma.prepaidExpense.findUnique({ where: { id: row.id }, include });
    return mapPrepaidExpense(full, currentPeriod());
};

// Name/description/accounts/cost center always editable while active. The
// schedule (months, start) locks at the first amortization; the amount
// also locks once the payment was registered here (its entry already
// carries that exact figure).
export const updatePrepaidExpense = async (accountId, actorId, id, payload) => {
    const current = await prisma.prepaidExpense.findFirst({ where: { id, createdById: accountId } });
    if (!current) throw new ApiError(404, "Prepaid expense not found.", [], "", "prepaid_not_found");
    if (current.status !== "active") throw new ApiError(409, "Only an active prepaid expense can be edited.", [], "", "prepaid_not_active");
    const changesSchedule = payload.months != null || payload.start_period != null;
    const changesAmount = payload.total_amount != null && round2(payload.total_amount) !== Number(current.totalAmount);
    if (changesSchedule && current.monthsAmortized > 0) throw new ApiError(409, "The schedule cannot change once amortization has started.", [], "", "prepaid_schedule_locked");
    if (changesAmount && (current.monthsAmortized > 0 || current.fundingEntryId)) throw new ApiError(409, "The amount cannot change once it was paid here or amortization has started.", [], "", "prepaid_amount_locked");

    const merged = {
        name: payload.name ?? current.name,
        description: payload.description ?? current.description,
        total_amount: payload.total_amount ?? Number(current.totalAmount),
        months: payload.months ?? current.months,
        start_period: payload.start_period ?? current.startPeriod,
        asset_account_id: current.fundingEntryId ? current.assetAccountId : (payload.asset_account_id ?? current.assetAccountId),
        expense_account_id: payload.expense_account_id ?? current.expenseAccountId,
        cost_center_id: payload.cost_center_id !== undefined ? payload.cost_center_id : current.costCenterId,
    };
    const data = { ...validateName(merged), ...validateSchedule(merged), ...(await validateAccounts(accountId, merged)) };
    const row = await prisma.prepaidExpense.update({ where: { id }, data, include });
    return mapPrepaidExpense(row, currentPeriod());
};

const postAmortization = async (tx, accountId, actorId, expense, period) => {
    const due = computeAmortizationDue(expense, period);
    if (due.pendingMonths === 0) return null;
    const range = due.fromPeriod === due.toPeriod ? due.fromPeriod : `${due.fromPeriod} a ${due.toPeriod}`;
    const entry = await recordJournalEntry(tx, {
        accountId,
        createdById: actorId,
        entryDate: new Date(),
        description: `Amortización diferido ${expense.name} (${range})`,
        sourceType: "prepaid_amortization",
        sourceId: expense.id,
        lines: [
            { chartAccountId: expense.expenseAccountId, debit: due.amount, credit: 0, costCenterId: expense.costCenterId },
            { chartAccountId: expense.assetAccountId, debit: 0, credit: due.amount, costCenterId: expense.costCenterId },
        ],
    });
    const monthsAmortized = expense.monthsAmortized + due.pendingMonths;
    // Guarded on the counter it read, so a cron run and a manual "amortizar
    // ahora" racing each other can't both post the same months.
    const claim = await tx.prepaidExpense.updateMany({
        where: { id: expense.id, monthsAmortized: expense.monthsAmortized, status: "active" },
        data: { monthsAmortized, status: monthsAmortized >= expense.months ? "completed" : "active", lastAmortizedPeriod: period, lastRunStatus: "success", lastRunError: null },
    });
    if (claim.count !== 1) throw new ApiError(409, "The prepaid expense changed in another session.", [], "", "prepaid_concurrent_change");
    return entry;
};

export const runPrepaidAmortizationNow = async (accountId, actorId, id) => {
    const expense = await prisma.prepaidExpense.findFirst({ where: { id, createdById: accountId } });
    if (!expense) throw new ApiError(404, "Prepaid expense not found.", [], "", "prepaid_not_found");
    if (expense.status !== "active") throw new ApiError(400, "This prepaid expense is not active.", [], "", "prepaid_not_active");
    const period = currentPeriod();
    if (computeAmortizationDue(expense, period).pendingMonths === 0) throw new ApiError(409, "Nothing is due to amortize yet.", [], "", "prepaid_nothing_due");
    try {
        return await prisma.$transaction((tx) => postAmortization(tx, accountId, actorId, expense, period), { isolationLevel: "Serializable" });
    } catch (err) {
        await prisma.prepaidExpense.update({ where: { id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "prepaid_amortization_failed" } });
        if (err?.code === "P2034") throw new ApiError(409, "The prepaid expense changed in another session.", [], "", "prepaid_concurrent_change");
        throw err instanceof ApiError ? err : new ApiError(422, "The amortization entry could not be generated.", [], "", "prepaid_amortization_failed");
    }
};

// Called daily by prepaidExpenseScheduler.js across every tenant.
export const generateDuePrepaidAmortizations = async () => {
    const period = currentPeriod();
    const candidates = await prisma.prepaidExpense.findMany({ where: { status: "active", OR: [{ lastAmortizedPeriod: null }, { lastAmortizedPeriod: { not: period } }] } });
    let posted = 0;
    let failed = 0;
    for (const expense of candidates) {
        if (computeAmortizationDue(expense, period).pendingMonths === 0) continue;
        try {
            await prisma.$transaction((tx) => postAmortization(tx, expense.createdById, expense.createdById, expense, period), { isolationLevel: "Serializable" });
            posted++;
        } catch (err) {
            await prisma.prepaidExpense.update({ where: { id: expense.id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "prepaid_amortization_failed" } });
            failed++;
        }
    }
    return { checked: candidates.length, posted, failed };
};

// e.g. an insurance policy cancelled early: whatever is still on the
// diferido is expensed now, in one entry, and the schedule stops. The
// remaining balance is re-derived from this row's own amortization lines,
// never trusted from monthsAmortized alone (same caution as
// fixedAsset.service.js#disposeFixedAsset).
export const cancelPrepaidExpense = async (accountId, actorId, id, { reason } = {}) => {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) throw new ApiError(400, "A reason is required.", [], "", "prepaid_cancel_reason_required");
    const current = await prisma.prepaidExpense.findFirst({ where: { id, createdById: accountId } });
    if (!current) throw new ApiError(404, "Prepaid expense not found.", [], "", "prepaid_not_found");
    if (current.status !== "active") throw new ApiError(409, "Only an active prepaid expense can be cancelled.", [], "", "prepaid_not_active");

    return prisma.$transaction(async (tx) => {
        const agg = await tx.journalEntryLine.aggregate({
            where: { chartAccountId: current.assetAccountId, journalEntry: { sourceType: "prepaid_amortization", sourceId: current.id } },
            _sum: { debit: true, credit: true },
        });
        const amortized = round2(Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0));
        const remaining = round2(Number(current.totalAmount) - amortized);
        if (remaining > 0) {
            await recordJournalEntry(tx, {
                accountId,
                createdById: actorId,
                entryDate: new Date(),
                description: `Cancelación diferido ${current.name}. ${trimmedReason}`,
                sourceType: "prepaid_cancellation",
                sourceId: current.id,
                lines: [
                    { chartAccountId: current.expenseAccountId, debit: remaining, credit: 0, costCenterId: current.costCenterId },
                    { chartAccountId: current.assetAccountId, debit: 0, credit: remaining, costCenterId: current.costCenterId },
                ],
            });
        }
        const claim = await tx.prepaidExpense.updateMany({ where: { id, status: "active" }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: trimmedReason } });
        if (claim.count !== 1) throw new ApiError(409, "The prepaid expense changed in another session.", [], "", "prepaid_concurrent_change");
        const row = await tx.prepaidExpense.findUnique({ where: { id }, include });
        return mapPrepaidExpense(row, null);
    }, { isolationLevel: "Serializable" });
};

// Close-readiness warning: diferidos with months due up to `period`
// ("YYYY-MM") that haven't been amortized yet.
export const findPendingAmortizations = async ({ accountId, period, db = prisma }) => {
    const rows = await db.prepaidExpense.findMany({ where: { createdById: accountId, status: "active" } });
    const pending = rows.map((row) => computeAmortizationDue(row, period)).filter((due) => due.pendingMonths > 0);
    return pending.length ? { count: pending.length, amount: round2(pending.reduce((sum, due) => sum + due.amount, 0)) } : null;
};
