import { prisma } from "../db/prisma.js";

const round2 = (n) => Number((Number(n) || 0).toFixed(2));
const sumAmounts = (rows) => rows.reduce((acc, r) => acc + r.amount, 0);

// asset/cost/expense carry a natural debit balance (debit - credit is
// "normal"); liability/equity/revenue carry a natural credit balance
// (credit - debit is "normal") - standard double-entry convention, same one
// accountingPosting.service.js's forward postings already assume implicitly
// (e.g. a sale debits Clientes/asset and credits Ingresos/revenue).
const balanceForType = (accountType, debit, credit) =>
    accountType === "asset" || accountType === "cost" || accountType === "expense" ? debit - credit : credit - debit;

// Groups every JournalEntryLine for this tenant's accounts of the given
// type(s) between startDate/endDate (either bound optional), one row per
// ChartAccount that actually has activity in range - mirrors
// journalEntry.service.js#listJournalEntries's tenant filter
// (period.createdById), the only place tenant scope lives for this ledger.
const aggregateByAccount = async ({ accountId, accountTypes, startDate, endDate }) => {
    const rows = await prisma.journalEntryLine.groupBy({
        by: ["chartAccountId"],
        where: {
            chartAccount: { accountType: { in: accountTypes }, createdById: accountId },
            journalEntry: {
                period: { createdById: accountId },
                ...(startDate || endDate
                    ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                    : {}),
            },
        },
        _sum: { debit: true, credit: true },
    });
    if (rows.length === 0) return [];

    const chartAccounts = await prisma.chartAccount.findMany({
        where: { id: { in: rows.map((r) => r.chartAccountId) } },
        select: { id: true, code: true, name: true, accountType: true },
    });
    const byId = new Map(chartAccounts.map((a) => [a.id, a]));

    return rows
        .map((row) => {
            const account = byId.get(row.chartAccountId);
            const debit = Number(row._sum.debit || 0);
            const credit = Number(row._sum.credit || 0);
            return {
                code: account.code,
                name: account.name,
                account_type: account.accountType,
                amount: round2(balanceForType(account.accountType, debit, credit)),
            };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
};

// This app never posts to "expense" (class 5 - rent, payroll, etc. aren't
// automated anywhere) - so in practice this is a gross-margin report
// (ingresos - costo de ventas), not a full net-income statement. `expenses`
// is included anyway (always empty today) so the shape is ready the moment
// something does post there, at zero extra cost.
export const getIncomeStatement = async ({ accountId, startDate, endDate }) => {
    const rows = await aggregateByAccount({ accountId, accountTypes: ["revenue", "cost", "expense"], startDate, endDate });
    const revenue = rows.filter((r) => r.account_type === "revenue");
    const costs = rows.filter((r) => r.account_type === "cost");
    const expenses = rows.filter((r) => r.account_type === "expense");

    const totalRevenue = round2(sumAmounts(revenue));
    const totalCosts = round2(sumAmounts(costs));
    const totalExpenses = round2(sumAmounts(expenses));
    const grossProfit = round2(totalRevenue - totalCosts);
    const netIncome = round2(grossProfit - totalExpenses);

    return {
        start_date: startDate ?? null,
        end_date: endDate ?? null,
        revenue, total_revenue: totalRevenue,
        costs, total_costs: totalCosts,
        gross_profit: grossProfit,
        expenses, total_expenses: totalExpenses,
        net_income: netIncome,
    };
};

// Cumulative from inception through asOfDate (never period-scoped) - a
// balance sheet is a snapshot of everything that ever happened, not a
// period's worth. `currentEarnings` is a DERIVED figure (life-to-date net
// income), not a posted equity account - there's no formal period-close in
// this app yet (Fase 5's own scope note), so accumulated profit only ever
// exists as this computed plug, same convention any interim/unaudited
// balance uses before closing entries run.
export const getBalanceSheet = async ({ accountId, asOfDate }) => {
    const rows = await aggregateByAccount({ accountId, accountTypes: ["asset", "liability", "equity"], endDate: asOfDate });
    const assets = rows.filter((r) => r.account_type === "asset");
    const liabilities = rows.filter((r) => r.account_type === "liability");
    const equity = rows.filter((r) => r.account_type === "equity");

    const totalAssets = round2(sumAmounts(assets));
    const totalLiabilities = round2(sumAmounts(liabilities));
    const totalEquityAccounts = round2(sumAmounts(equity));

    const incomeStatement = await getIncomeStatement({ accountId, endDate: asOfDate });
    const currentEarnings = incomeStatement.net_income;

    const totalEquity = round2(totalEquityAccounts + currentEarnings);
    const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);

    return {
        as_of_date: asOfDate,
        assets, total_assets: totalAssets,
        liabilities, total_liabilities: totalLiabilities,
        equity, current_earnings: currentEarnings,
        total_equity: totalEquity,
        total_liabilities_and_equity: totalLiabilitiesAndEquity,
        // Must always be true by construction - every JournalEntry already
        // balances (recordJournalEntry enforces it), so this is a live
        // sanity check on the report itself, not just another figure.
        balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
};
