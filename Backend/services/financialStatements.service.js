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
const aggregateByAccount = async ({ accountId, accountTypes, startDate, endDate, excludeSourceTypes, periodIds, db = prisma }) => {
    const rows = await db.journalEntryLine.groupBy({
        by: ["chartAccountId"],
        where: {
            chartAccount: { accountType: { in: accountTypes }, createdById: accountId },
            journalEntry: {
                period: { createdById: accountId },
                ...(startDate || endDate
                    ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                    : {}),
                ...(excludeSourceTypes ? { sourceType: { notIn: excludeSourceTypes } } : {}),
                ...(periodIds ? { periodId: { in: periodIds } } : {}),
            },
        },
        _sum: { debit: true, credit: true },
    });
    if (rows.length === 0) return [];

    const chartAccounts = await db.chartAccount.findMany({
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
                id: account.id,
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
//
// Excludes `period_close` lines: those exist only to zero a closed period's
// nominal accounts into retained earnings (see accountingPeriod.service.js),
// and would otherwise cancel out that same period's real revenue/costs when
// this function is asked about a range that includes it.
export const getIncomeStatement = async ({ accountId, startDate, endDate }) => {
    const rows = await aggregateByAccount({
        accountId,
        accountTypes: ["revenue", "cost", "expense"],
        startDate,
        endDate,
        excludeSourceTypes: ["period_close", "period_reopen", "period_reclose"],
    });
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

// Periods that don't yet have a posted `period_close` entry - their net
// result still only exists as the derived `currentEarnings` plug below.
// Once a period IS closed (accountingPeriod.service.js), its result moves
// into a real "Utilidades acumuladas" equity balance instead, so it must
// drop out of this set or it would be counted twice.
const getUnclosedPeriodIds = async (accountId, asOfDate) => {
    const periods = await prisma.accountingPeriod.findMany({ where: { createdById: accountId }, select: { id: true } });
    if (periods.length === 0) return [];
    const lifecycleEntries = await prisma.journalEntry.findMany({
        where: {
            sourceType: { in: ["period_close", "period_reopen", "period_reclose"] },
            periodId: { in: periods.map((p) => p.id) },
            // Historical snapshots before a closing entry's effective date
            // must still derive that period's earnings. Ignoring asOfDate
            // here made earnings disappear from mid-period historical
            // balance sheets after the period was later closed.
            ...(asOfDate ? { entryDate: { lte: asOfDate } } : {}),
        },
        select: { periodId: true, sourceType: true },
        orderBy: { createdAt: "asc" },
    });
    const latestByPeriod = new Map(lifecycleEntries.map((entry) => [entry.periodId, entry.sourceType]));
    const closedIds = new Set([...latestByPeriod.entries()].filter(([, sourceType]) => sourceType !== "period_reopen").map(([periodId]) => periodId));
    return periods.filter((p) => !closedIds.has(p.id)).map((p) => p.id);
};

// Cumulative from inception through asOfDate (never period-scoped) - a
// balance sheet is a snapshot of everything that ever happened, not a
// period's worth. `currentEarnings` is a DERIVED plug covering only periods
// that haven't been formally closed yet; a closed period's result is a real
// posted equity balance instead (see getUnclosedPeriodIds above), which
// `equity` below already picks up like any other account.
export const getBalanceSheet = async ({ accountId, asOfDate }) => {
    const rows = await aggregateByAccount({ accountId, accountTypes: ["asset", "liability", "equity"], endDate: asOfDate });
    const assets = rows.filter((r) => r.account_type === "asset");
    const liabilities = rows.filter((r) => r.account_type === "liability");
    const equity = rows.filter((r) => r.account_type === "equity");

    const totalAssets = round2(sumAmounts(assets));
    const totalLiabilities = round2(sumAmounts(liabilities));
    const totalEquityAccounts = round2(sumAmounts(equity));

    const unclosedPeriodIds = await getUnclosedPeriodIds(accountId, asOfDate);
    const currentEarnings = unclosedPeriodIds.length
        ? (await (async () => {
              const nominalRows = await aggregateByAccount({
                  accountId,
                  accountTypes: ["revenue", "cost", "expense"],
                  endDate: asOfDate,
                  excludeSourceTypes: ["period_close", "period_reopen", "period_reclose"],
                  periodIds: unclosedPeriodIds,
              });
              const revenue = round2(sumAmounts(nominalRows.filter((r) => r.account_type === "revenue")));
              const costs = round2(sumAmounts(nominalRows.filter((r) => r.account_type === "cost")));
              const expenses = round2(sumAmounts(nominalRows.filter((r) => r.account_type === "expense")));
              return round2(revenue - costs - expenses);
          })())
        : 0;

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

// Builds the reversing lines for a period-close entry: one line per
// revenue/cost/expense account with net activity in [startDate, endDate],
// sized to bring that account's balance for the period back to zero, plus
// the balancing amount that closeAccountingPeriod posts to retained
// earnings. Returns amounts only (Number, not Decimal) - accountingPeriod.
// service.js decides where they get posted; this function never writes.
export const getPeriodClosingPlan = async ({ accountId, startDate, endDate, db = prisma }) => {
    const rows = await aggregateByAccount({
        accountId,
        accountTypes: ["revenue", "cost", "expense"],
        startDate,
        endDate,
        excludeSourceTypes: ["period_close", "period_reopen", "period_reclose"],
        db,
    });

    // Revenue is credit-normal (amount = credit - debit): a positive balance
    // needs a debit to zero it. Cost/expense are debit-normal (amount =
    // debit - credit): a positive balance needs a credit. Either polarity
    // flips the same way if a period nets negative (e.g. returns > sales).
    const reversalLines = rows
        .filter((r) => r.amount !== 0)
        .map((r) => {
            const zeroesWithDebit = r.account_type === "revenue" ? r.amount > 0 : r.amount < 0;
            const magnitude = Math.abs(r.amount);
            return {
                chartAccountId: r.id,
                debit: zeroesWithDebit ? magnitude : 0,
                credit: zeroesWithDebit ? 0 : magnitude,
            };
        });

    const totalRevenue = round2(sumAmounts(rows.filter((r) => r.account_type === "revenue")));
    const totalCosts = round2(sumAmounts(rows.filter((r) => r.account_type === "cost")));
    const totalExpenses = round2(sumAmounts(rows.filter((r) => r.account_type === "expense")));
    const netIncome = round2(totalRevenue - totalCosts - totalExpenses);

    return { reversalLines, netIncome };
};

// Balance de comprobación: every account in the chart (active or not, even
// with zero activity) with its opening balance, this period's debit/credit
// movement, and closing balance. Unlike the income statement/balance sheet
// (which each show one slice of the chart), this is the classic "does
// everything still tie out" report - useful right before closing a period.
export const getTrialBalance = async ({ accountId, startDate, endDate }) => {
    const accounts = await prisma.chartAccount.findMany({ where: { createdById: accountId }, orderBy: { code: "asc" } });
    if (accounts.length === 0) return [];

    const priorRows = startDate
        ? await prisma.journalEntryLine.groupBy({
              by: ["chartAccountId"],
              where: { chartAccount: { createdById: accountId }, journalEntry: { period: { createdById: accountId }, entryDate: { lt: startDate } } },
              _sum: { debit: true, credit: true },
          })
        : [];
    const priorById = new Map(priorRows.map((r) => [r.chartAccountId, r]));

    const rangeRows = await prisma.journalEntryLine.groupBy({
        by: ["chartAccountId"],
        where: {
            chartAccount: { createdById: accountId },
            journalEntry: {
                period: { createdById: accountId },
                ...(startDate || endDate
                    ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
                    : {}),
            },
        },
        _sum: { debit: true, credit: true },
    });
    const rangeById = new Map(rangeRows.map((r) => [r.chartAccountId, r]));

    return accounts.map((account) => {
        const prior = priorById.get(account.id);
        const range = rangeById.get(account.id);
        const openingBalance = prior ? balanceForType(account.accountType, Number(prior._sum.debit || 0), Number(prior._sum.credit || 0)) : 0;
        const debit = Number(range?._sum.debit || 0);
        const credit = Number(range?._sum.credit || 0);

        return {
            id: account.id,
            code: account.code,
            name: account.name,
            account_type: account.accountType,
            is_active: account.isActive,
            opening_balance: round2(openingBalance),
            debit: round2(debit),
            credit: round2(credit),
            closing_balance: round2(openingBalance + balanceForType(account.accountType, debit, credit)),
        };
    });
};
