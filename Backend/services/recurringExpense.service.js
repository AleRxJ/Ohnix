import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { claimCashAccount, recordCashMovement } from "./cashMovement.service.js";
import { resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { applyLocationCostCenter } from "./accountingPosting.service.js";

const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 28;

const templateInclude = {
    expenseAccount: { select: { id: true, code: true, name: true } },
    cashAccount: { select: { id: true, name: true, pointOfSaleId: true } },
};

const mapTemplate = (template) => ({
    _id: template.id,
    description: template.description,
    amount: Number(template.amount),
    day_of_month: template.dayOfMonth,
    is_active: template.isActive,
    last_generated_period: template.lastGeneratedPeriod,
    last_run_status: template.lastRunStatus,
    last_run_error: template.lastRunError,
    expense_account: template.expenseAccount
        ? { _id: template.expenseAccount.id, code: template.expenseAccount.code, name: template.expenseAccount.name }
        : undefined,
    cash_account: template.cashAccount ? { _id: template.cashAccount.id, name: template.cashAccount.name } : undefined,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
});

// "America/Bogota" by default, same override subscriptionRenewalScheduler.js
// uses - a template's dayOfMonth is a local calendar day, not a UTC one, so
// the cron's "is it due yet" check has to read today's date in the same zone
// the user who configured it is thinking in.
const currentLocalParts = (tz) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type).value;
    return { year: get("year"), month: get("month"), day: Number(get("day")) };
};

const resolveTimezone = () => {
    const tz = process.env.TIMEZONE || "America/Bogota";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz;
    } catch {
        return "UTC";
    }
};

export const listRecurringExpenseTemplates = (accountId, { includeInactive = false } = {}) =>
    prisma.recurringExpenseTemplate
        .findMany({
            where: { createdById: accountId, ...(includeInactive ? {} : { isActive: true }) },
            include: templateInclude,
            orderBy: [{ description: "asc" }],
        })
        .then((rows) => rows.map(mapTemplate));

const validateTemplateInputs = async (accountId, payload) => {
    const description = String(payload.description || "").trim();
    const amount = Number(Number(payload.amount).toFixed(2));
    const dayOfMonth = Number(payload.day_of_month);
    if (!description) throw new ApiError(400, "La descripción del gasto recurrente es obligatoria.");
    if (description.length > 160) throw new ApiError(400, "La descripción supera la longitud permitida.");
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero.");
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < MIN_DAY_OF_MONTH || dayOfMonth > MAX_DAY_OF_MONTH) {
        throw new ApiError(400, `El día del mes debe estar entre ${MIN_DAY_OF_MONTH} y ${MAX_DAY_OF_MONTH}.`);
    }

    const [expenseAccount, cashAccount] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: payload.expense_account_id, createdById: accountId, accountType: "expense", isActive: true } }),
        prisma.cashAccount.findFirst({ where: { id: payload.cash_account_id, createdById: accountId, isActive: true } }),
    ]);
    if (!expenseAccount) throw new ApiError(404, "Cuenta de gasto no encontrada o inactiva.");
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada o inactiva.");

    return { description, amount, dayOfMonth, expenseAccountId: expenseAccount.id, cashAccountId: cashAccount.id };
};

export const createRecurringExpenseTemplate = async (accountId, actorId, payload) => {
    const data = await validateTemplateInputs(accountId, payload);
    return prisma.recurringExpenseTemplate
        .create({ data: { createdById: accountId, ...data }, include: templateInclude })
        .then(mapTemplate);
};

export const updateRecurringExpenseTemplate = async (accountId, actorId, id, payload) => {
    const current = await prisma.recurringExpenseTemplate.findFirst({ where: { id, createdById: accountId } });
    if (!current) throw new ApiError(404, "Gasto recurrente no encontrado.");

    const merged = {
        description: payload.description ?? current.description,
        amount: payload.amount ?? Number(current.amount),
        day_of_month: payload.day_of_month ?? current.dayOfMonth,
        expense_account_id: payload.expense_account_id ?? current.expenseAccountId,
        cash_account_id: payload.cash_account_id ?? current.cashAccountId,
    };
    const data = await validateTemplateInputs(accountId, merged);
    const isActive = typeof payload.is_active === "boolean" ? payload.is_active : current.isActive;

    return prisma.recurringExpenseTemplate
        .update({ where: { id }, data: { ...data, isActive }, include: templateInclude })
        .then(mapTemplate);
};

// The actual posting, shared by the cron and the "generar ahora" manual
// trigger below - identical shape to manualExpense.service.js's
// registerManualExpense (claim cash, post the journal entry, record the cash
// movement) so a recurring expense reads in every report exactly like one
// entered by hand, just tagged with a different sourceType for traceability.
const postTemplateExpense = async (tx, accountId, actorId, template, entryDate, period) => {
    const [expenseAccount, cashAccount] = await Promise.all([
        tx.chartAccount.findFirst({ where: { id: template.expenseAccountId, createdById: accountId, accountType: "expense", isActive: true } }),
        tx.cashAccount.findFirst({ where: { id: template.cashAccountId, createdById: accountId, isActive: true } }),
    ]);
    if (!expenseAccount) throw new Error("La cuenta de gasto ya no existe o está inactiva.");
    if (!cashAccount) throw new Error("La cuenta de caja/banco ya no existe o está inactiva.");

    const amount = Number(template.amount);
    const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount });
    if (balanceAfter === null) throw new Error("Saldo insuficiente en la cuenta de caja/banco.");

    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
    const description = `${template.description} (${period})`;
    const entry = await recordJournalEntry(tx, {
        accountId,
        createdById: actorId,
        entryDate,
        description,
        sourceType: "recurring_expense",
        sourceId: template.id,
        lines: await applyLocationCostCenter(tx, accountId, cashAccount.pointOfSaleId, [
            { chartAccountId: expenseAccount.id, debit: amount, credit: 0 },
            { chartAccountId: cashChartAccountId, debit: 0, credit: amount },
        ]),
    });

    await recordCashMovement(tx, {
        cashAccountId: cashAccount.id,
        delta: -amount,
        balanceAfter,
        sourceType: "manual_withdrawal",
        sourceId: entry.id,
        reason: description,
        createdById: actorId,
    });

    return entry;
};

// Manual "generar ahora" trigger for one template - same dedupe as the cron
// (won't double-post within the same calendar month) so an admin testing or
// front-running the cron can't accidentally create two entries for the same
// period.
export const runRecurringExpenseTemplateNow = async (accountId, actorId, id) => {
    const template = await prisma.recurringExpenseTemplate.findFirst({ where: { id, createdById: accountId } });
    if (!template) throw new ApiError(404, "Gasto recurrente no encontrado.");
    if (!template.isActive) throw new ApiError(400, "El gasto recurrente está inactivo.");

    const { year, month } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;
    if (template.lastGeneratedPeriod === period) {
        throw new ApiError(409, "Este gasto recurrente ya se generó para el periodo actual.");
    }

    try {
        const entry = await prisma.$transaction(
            (tx) => postTemplateExpense(tx, accountId, actorId, template, new Date(), period),
            { isolationLevel: "Serializable" }
        );
        await prisma.recurringExpenseTemplate.update({
            where: { id },
            data: { lastGeneratedPeriod: period, lastRunStatus: "success", lastRunError: null },
        });
        return entry;
    } catch (err) {
        await prisma.recurringExpenseTemplate.update({
            where: { id },
            data: { lastRunStatus: "failed", lastRunError: err?.message?.slice(0, 500) || "Error desconocido." },
        });
        throw err instanceof ApiError ? err : new ApiError(422, err?.message || "No se pudo generar el gasto recurrente.");
    }
};

// Called daily by recurringExpenseScheduler.js across every tenant - not
// scoped to one accountId, same shape as subscriptionRenewalScheduler.js's
// checks. A template is "due" once today's local day-of-month has reached
// its configured day AND it hasn't already posted for this calendar month;
// a failure (e.g. insufficient funds) is recorded on the row instead of
// thrown, so one tenant's problem template never blocks another tenant's run.
export const generateDueRecurringExpenses = async () => {
    const { year, month, day } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;

    const dueTemplates = await prisma.recurringExpenseTemplate.findMany({
        where: { isActive: true, dayOfMonth: { lte: day }, lastGeneratedPeriod: { not: period } },
    });

    let posted = 0;
    let failed = 0;
    for (const template of dueTemplates) {
        try {
            await prisma.$transaction(
                (tx) => postTemplateExpense(tx, template.createdById, template.createdById, template, new Date(), period),
                { isolationLevel: "Serializable" }
            );
            await prisma.recurringExpenseTemplate.update({
                where: { id: template.id },
                data: { lastGeneratedPeriod: period, lastRunStatus: "success", lastRunError: null },
            });
            posted++;
        } catch (err) {
            await prisma.recurringExpenseTemplate.update({
                where: { id: template.id },
                data: { lastRunStatus: "failed", lastRunError: err?.message?.slice(0, 500) || "Error desconocido." },
            });
            failed++;
        }
    }
    return { checked: dueTemplates.length, posted, failed };
};
