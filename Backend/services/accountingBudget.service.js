import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { calculateBudgetPerformance } from "../utils/accountingBudget.js";

const parsePeriod = (yearValue, monthValue) => {
    const year = Number(yearValue);
    const month = Number(monthValue);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new ApiError(400, "The budget year and month are invalid.", [], "", "accounting_budget_invalid_period");
    }
    return { year, month };
};

const assertPeriodEditable = async (db, accountId, year, month) => {
    const period = await db.accountingPeriod.findUnique({ where: { createdById_year_month: { createdById: accountId, year, month } } });
    if (period?.status === "closed" && (!period.reopenedUntil || period.reopenedUntil <= new Date())) {
        throw new ApiError(409, "A budget in a closed accounting period cannot be modified.", [], "", "accounting_budget_period_closed");
    }
};

export const saveBudgets = async ({ accountId, actorId, year: yearValue, month: monthValue, items }) => {
    const { year, month } = parsePeriod(yearValue, monthValue);
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new ApiError(400, "Provide between 1 and 500 budget lines.", [], "", "accounting_budget_invalid_items");
    const normalized = items.map((item, index) => {
        const amount = Number(item.amount);
        const threshold = Number(item.alert_threshold_percent ?? 10);
        if (!item.chart_account_id || !Number.isFinite(amount) || amount < 0) throw new ApiError(400, `Budget line ${index + 1} is invalid.`, [{ index: index + 1 }], "", "accounting_budget_invalid_line");
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000) throw new ApiError(400, `The threshold for budget line ${index + 1} is invalid.`, [{ index: index + 1 }], "", "accounting_budget_invalid_threshold");
        return { chartAccountId: item.chart_account_id, costCenterId: item.cost_center_id || null, dimensionKey: item.cost_center_id || "__all__", amount: Number(amount.toFixed(2)), threshold: Number(threshold.toFixed(2)) };
    });
    const keys = normalized.map((item) => `${item.chartAccountId}:${item.dimensionKey}`);
    if (new Set(keys).size !== keys.length) throw new ApiError(400, "Duplicate lines exist for the same account and cost center.", [], "", "accounting_budget_duplicate_lines");

    return prisma.$transaction(async (tx) => {
        await assertPeriodEditable(tx, accountId, year, month);
        const accountIds = [...new Set(normalized.map((item) => item.chartAccountId))];
        const accounts = await tx.chartAccount.findMany({ where: { id: { in: accountIds }, createdById: accountId, isActive: true, accountType: { in: ["revenue", "cost", "expense"] } }, select: { id: true } });
        if (accounts.length !== accountIds.length) throw new ApiError(400, "Only active revenue, cost, or expense accounts may be budgeted.", [], "", "accounting_budget_invalid_account");
        const centerIds = [...new Set(normalized.map((item) => item.costCenterId).filter(Boolean))];
        if (centerIds.length) {
            const count = await tx.costCenter.count({ where: { id: { in: centerIds }, accountId, isActive: true } });
            if (count !== centerIds.length) throw new ApiError(400, "One or more cost centers are invalid or inactive.", [], "", "accounting_budget_invalid_cost_center");
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
    if (!budget) throw new ApiError(404, "Budget line not found.", [], "", "accounting_budget_not_found");
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

const parseYear = (value) => {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "The budget year is invalid.", [], "", "accounting_budget_invalid_year");
    return year;
};

export const getAnnualBudgetReport = async ({ accountId, year: yearValue, costCenterId }) => {
    const year = parseYear(yearValue);
    const monthly = await Promise.all(Array.from({ length: 12 }, (_, index) => getBudgetReport({ accountId, year, month: index + 1, costCenterId })));
    const rowMap = new Map();
    monthly.forEach((report) => report.rows.forEach((row) => {
        const key = `${row.chart_account.id}:${row.cost_center?.id || "__all__"}`;
        if (!rowMap.has(key)) rowMap.set(key, { chart_account: row.chart_account, cost_center: row.cost_center, months: Array(12).fill(null), budget: 0, actual: 0, alert_count: 0 });
        const annualRow = rowMap.get(key);
        annualRow.months[report.month - 1] = row;
        annualRow.budget += row.budget;
        annualRow.actual += row.actual;
        if (row.alert) annualRow.alert_count += 1;
    }));
    const rows = [...rowMap.values()].map((row) => ({
        ...row,
        budget: Number(row.budget.toFixed(2)),
        actual: Number(row.actual.toFixed(2)),
        variance: Number((row.actual - row.budget).toFixed(2)),
    })).sort((a, b) => a.chart_account.code.localeCompare(b.chart_account.code));
    const total = (field) => Number(monthly.reduce((sum, report) => sum + Number(report.summary[field] || 0), 0).toFixed(2));
    return { year, rows, months: monthly.map(({ month, summary }) => ({ month, ...summary })), summary: {
        planned_revenue: total("planned_revenue"), actual_revenue: total("actual_revenue"),
        planned_spend: total("planned_spend"), actual_spend: total("actual_spend"),
        alert_count: monthly.reduce((sum, report) => sum + report.summary.alert_count, 0),
    } };
};

export const distributeAnnualBudget = async ({ accountId, actorId, year: yearValue, chartAccountId, costCenterId, annualAmount, alertThresholdPercent = 10 }) => {
    const year = parseYear(yearValue);
    const amount = Number(annualAmount);
    const threshold = Number(alertThresholdPercent);
    if (!chartAccountId || !Number.isFinite(amount) || amount < 0) throw new ApiError(400, "The account and annual amount are required.", [], "", "accounting_budget_invalid_annual_amount");
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000) throw new ApiError(400, "The alert threshold is invalid.", [], "", "accounting_budget_invalid_threshold");
    const base = Math.floor((amount * 100) / 12) / 100;
    const amounts = Array(12).fill(base);
    amounts[11] = Number((amount - base * 11).toFixed(2));
    return prisma.$transaction(async (tx) => {
        const account = await tx.chartAccount.findFirst({ where: { id: chartAccountId, createdById: accountId, isActive: true, accountType: { in: ["revenue", "cost", "expense"] } } });
        if (!account) throw new ApiError(400, "Only active nominal accounts owned by the company may be budgeted.", [], "", "accounting_budget_invalid_account");
        if (costCenterId) {
            const center = await tx.costCenter.findFirst({ where: { id: costCenterId, accountId, isActive: true } });
            if (!center) throw new ApiError(400, "The cost center is invalid or inactive.", [], "", "accounting_budget_invalid_cost_center");
        }
        for (let month = 1; month <= 12; month += 1) await assertPeriodEditable(tx, accountId, year, month);
        const dimensionKey = costCenterId || "__all__";
        for (let month = 1; month <= 12; month += 1) {
            const key = { accountId_year_month_chartAccountId_dimensionKey: { accountId, year, month, chartAccountId, dimensionKey } };
            const previous = await tx.accountingBudget.findUnique({ where: key });
            const budget = await tx.accountingBudget.upsert({ where: key, create: { accountId, year, month, chartAccountId, costCenterId: costCenterId || null, dimensionKey, amount: amounts[month - 1], alertThresholdPercent: threshold, createdById: actorId, updatedById: actorId }, update: { amount: amounts[month - 1], alertThresholdPercent: threshold, updatedById: actorId } });
            await tx.accountingConfigAudit.create({ data: { accountId, actorId, entityType: "accounting_budget", entityId: budget.id, action: previous ? "annual_distribution_updated" : "annual_distribution_created", before: previous ? { amount: Number(previous.amount) } : undefined, after: { year, month, amount: amounts[month - 1], chart_account_id: chartAccountId, cost_center_id: costCenterId || null } } });
        }
        return { year, annual_amount: Number(amount.toFixed(2)), monthly_amounts: amounts };
    });
};

export const copyAnnualBudget = async ({ accountId, actorId, sourceYear: sourceValue, targetYear: targetValue, costCenterId, overwrite = false }) => {
    const sourceYear = parseYear(sourceValue);
    const targetYear = parseYear(targetValue);
    if (sourceYear === targetYear) throw new ApiError(400, "Source and target years must be different.", [], "", "accounting_budget_same_copy_year");
    return prisma.$transaction(async (tx) => {
        const dimension = costCenterId && costCenterId !== "all" ? costCenterId : null;
        const source = await tx.accountingBudget.findMany({ where: { accountId, year: sourceYear, costCenterId: dimension } });
        if (!source.length) throw new ApiError(404, "No source-year budget exists for this dimension.", [], "", "accounting_budget_copy_source_empty");
        for (let month = 1; month <= 12; month += 1) await assertPeriodEditable(tx, accountId, targetYear, month);
        let copied = 0; let skipped = 0;
        for (const item of source) {
            const key = { accountId_year_month_chartAccountId_dimensionKey: { accountId, year: targetYear, month: item.month, chartAccountId: item.chartAccountId, dimensionKey: item.dimensionKey } };
            const existing = await tx.accountingBudget.findUnique({ where: key });
            if (existing && !overwrite) { skipped += 1; continue; }
            const budget = await tx.accountingBudget.upsert({ where: key, create: { accountId, year: targetYear, month: item.month, chartAccountId: item.chartAccountId, costCenterId: item.costCenterId, dimensionKey: item.dimensionKey, amount: item.amount, alertThresholdPercent: item.alertThresholdPercent, createdById: actorId, updatedById: actorId }, update: { amount: item.amount, alertThresholdPercent: item.alertThresholdPercent, updatedById: actorId } });
            await tx.accountingConfigAudit.create({ data: { accountId, actorId, entityType: "accounting_budget", entityId: budget.id, action: existing ? "annual_copy_overwritten" : "annual_copy_created", before: existing ? { amount: Number(existing.amount), year: targetYear } : undefined, after: { source_year: sourceYear, target_year: targetYear, month: item.month, amount: Number(item.amount) } } });
            copied += 1;
        }
        return { source_year: sourceYear, target_year: targetYear, copied, skipped };
    });
};
