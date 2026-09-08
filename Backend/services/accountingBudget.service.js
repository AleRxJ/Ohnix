import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { calculateBudgetPerformance } from "../utils/accountingBudget.js";

const parsePeriod = (yearValue, monthValue) => {
    const year = Number(yearValue);
    const month = Number(monthValue);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new ApiError(400, "El año y el mes del presupuesto no son válidos.");
    }
    return { year, month };
};

const assertPeriodEditable = async (db, accountId, year, month) => {
    const period = await db.accountingPeriod.findUnique({ where: { createdById_year_month: { createdById: accountId, year, month } } });
    if (period?.status === "closed" && (!period.reopenedUntil || period.reopenedUntil <= new Date())) {
        throw new ApiError(409, "No puedes modificar el presupuesto de un periodo contable cerrado.", [], "", "accounting_budget_period_closed");
    }
};

export const saveBudgets = async ({ accountId, actorId, year: yearValue, month: monthValue, items }) => {
    const { year, month } = parsePeriod(yearValue, monthValue);
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new ApiError(400, "Incluye entre 1 y 500 partidas presupuestales.");
    const normalized = items.map((item, index) => {
        const amount = Number(item.amount);
        const threshold = Number(item.alert_threshold_percent ?? 10);
        if (!item.chart_account_id || !Number.isFinite(amount) || amount < 0) throw new ApiError(400, `La partida ${index + 1} no es válida.`);
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000) throw new ApiError(400, `El umbral de la partida ${index + 1} no es válido.`);
        return { chartAccountId: item.chart_account_id, costCenterId: item.cost_center_id || null, dimensionKey: item.cost_center_id || "__all__", amount: Number(amount.toFixed(2)), threshold: Number(threshold.toFixed(2)) };
    });
    const keys = normalized.map((item) => `${item.chartAccountId}:${item.dimensionKey}`);
    if (new Set(keys).size !== keys.length) throw new ApiError(400, "Hay partidas duplicadas para la misma cuenta y centro de costo.");

    return prisma.$transaction(async (tx) => {
        await assertPeriodEditable(tx, accountId, year, month);
        const accountIds = [...new Set(normalized.map((item) => item.chartAccountId))];
        const accounts = await tx.chartAccount.findMany({ where: { id: { in: accountIds }, createdById: accountId, isActive: true, accountType: { in: ["revenue", "cost", "expense"] } }, select: { id: true } });
        if (accounts.length !== accountIds.length) throw new ApiError(400, "Solo puedes presupuestar cuentas activas de ingresos, costos o gastos de tu empresa.");
        const centerIds = [...new Set(normalized.map((item) => item.costCenterId).filter(Boolean))];
        if (centerIds.length) {
            const count = await tx.costCenter.count({ where: { id: { in: centerIds }, accountId, isActive: true } });
            if (count !== centerIds.length) throw new ApiError(400, "Uno o más centros de costo no son válidos o están inactivos.");
        }
        const saved = [];
        for (const item of normalized) {
            const key = { accountId_year_month_chartAccountId_dimensionKey: { accountId, year, month, chartAccountId: item.chartAccountId, dimensionKey: item.dimensionKey } };
            const previous = await tx.accountingBudget.findUnique({ where: key });
            const budget = await tx.accountingBudget.upsert({
                where: key,
                create: { accountId, year, month, chartAccountId: item.chartAccountId, costCenterId: item.costCenterId, dimensionKey: item.dimensionKey, amount: item.amount, alertThresholdPercent: item.threshold, createdById: actorId, updatedById: actorId },
                update: { amount: item.amount, alertThresholdPercent: item.threshold, updatedById: actorId },
            });
            await tx.accountingConfigAudit.create({ data: { accountId, actorId, entityType: "accounting_budget", entityId: budget.id, action: previous ? "updated" : "created", before: previous ? { amount: Number(previous.amount), alert_threshold_percent: Number(previous.alertThresholdPercent) } : undefined, after: { year, month, chart_account_id: item.chartAccountId, cost_center_id: item.costCenterId, amount: item.amount, alert_threshold_percent: item.threshold } } });
            saved.push(budget);
        }
        return saved;
    });
};

export const deleteBudget = async ({ accountId, actorId, id }) => prisma.$transaction(async (tx) => {
    const budget = await tx.accountingBudget.findFirst({ where: { id, accountId } });
    if (!budget) throw new ApiError(404, "Partida presupuestal no encontrada.");
    await assertPeriodEditable(tx, accountId, budget.year, budget.month);
    await tx.accountingBudget.delete({ where: { id } });
    await tx.accountingConfigAudit.create({ data: { accountId, actorId, entityType: "accounting_budget", entityId: id, action: "deleted", before: { year: budget.year, month: budget.month, chart_account_id: budget.chartAccountId, cost_center_id: budget.costCenterId, amount: Number(budget.amount), alert_threshold_percent: Number(budget.alertThresholdPercent) } } });
});

export const getBudgetReport = async ({ accountId, year: yearValue, month: monthValue, costCenterId }) => {
    const { year, month } = parsePeriod(yearValue, monthValue);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));
    const budgets = await prisma.accountingBudget.findMany({
        where: { accountId, year, month, costCenterId: costCenterId && costCenterId !== "all" ? costCenterId : null },
        include: { chartAccount: { select: { id: true, code: true, name: true, accountType: true } }, costCenter: { select: { id: true, code: true, name: true, isActive: true } } },
        orderBy: [{ chartAccount: { code: "asc" } }, { dimensionKey: "asc" }],
    });
    const accountIds = [...new Set(budgets.map((budget) => budget.chartAccountId))];
    const globalActualRows = accountIds.length ? await prisma.journalEntryLine.groupBy({
        by: ["chartAccountId"],
        where: { chartAccountId: { in: accountIds }, chartAccount: { createdById: accountId }, journalEntry: { period: { createdById: accountId }, entryDate: { gte: startDate, lt: endDate }, sourceType: { notIn: ["period_close", "period_reopen", "period_reclose"] } } },
        _sum: { debit: true, credit: true },
    }) : [];
    const centerActualRows = accountIds.length ? await prisma.journalEntryLine.groupBy({
        by: ["chartAccountId", "costCenterId"],
        where: { chartAccountId: { in: accountIds }, chartAccount: { createdById: accountId }, costCenterId: { not: null }, journalEntry: { period: { createdById: accountId }, entryDate: { gte: startDate, lt: endDate }, sourceType: { notIn: ["period_close", "period_reopen", "period_reclose"] } } },
        _sum: { debit: true, credit: true },
    }) : [];
    const naturalAmount = (type, row) => type === "revenue" ? Number(row?._sum.credit || 0) - Number(row?._sum.debit || 0) : Number(row?._sum.debit || 0) - Number(row?._sum.credit || 0);
    const globalByAccount = new Map(globalActualRows.map((row) => [row.chartAccountId, row]));
    const centerByKey = new Map(centerActualRows.map((row) => [`${row.chartAccountId}:${row.costCenterId}`, row]));
    const rows = budgets.map((budget) => {
        const actualRow = budget.costCenterId ? centerByKey.get(`${budget.chartAccountId}:${budget.costCenterId}`) : globalByAccount.get(budget.chartAccountId);
        return {
            id: budget.id, year, month,
            chart_account: { id: budget.chartAccount.id, code: budget.chartAccount.code, name: budget.chartAccount.name, account_type: budget.chartAccount.accountType },
            cost_center: budget.costCenter ? { id: budget.costCenter.id, code: budget.costCenter.code, name: budget.costCenter.name, is_active: budget.costCenter.isActive } : null,
            alert_threshold_percent: Number(budget.alertThresholdPercent),
            ...calculateBudgetPerformance({ accountType: budget.chartAccount.accountType, budget: Number(budget.amount), actual: naturalAmount(budget.chartAccount.accountType, actualRow), thresholdPercent: Number(budget.alertThresholdPercent) }),
        };
    });
    const sum = (filtered, field) => Number(filtered.reduce((total, row) => total + row[field], 0).toFixed(2));
    const revenueRows = rows.filter((row) => row.chart_account.account_type === "revenue");
    const spendRows = rows.filter((row) => ["cost", "expense"].includes(row.chart_account.account_type));
    return { year, month, rows, summary: {
        planned_revenue: sum(revenueRows, "budget"), actual_revenue: sum(revenueRows, "actual"),
        planned_spend: sum(spendRows, "budget"), actual_spend: sum(spendRows, "actual"),
        alert_count: rows.filter((row) => row.alert).length,
    } };
};
