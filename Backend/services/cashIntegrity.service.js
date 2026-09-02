import { prisma } from "../db/prisma.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));

export const getCashIntegrity = async ({ accountId, db = prisma }) => {
    const accounts = await db.cashAccount.findMany({
        where: { createdById: accountId },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
        orderBy: { name: "asc" },
    });
    const accountIds = accounts.map((row) => row.id);
    const chartAccountIds = [...new Set(accounts.map((row) => row.chartAccountId).filter(Boolean))];
    const [movementTotals, ledgerLines] = await Promise.all([
        accountIds.length ? db.cashMovement.groupBy({ by: ["cashAccountId"], where: { cashAccountId: { in: accountIds } }, _sum: { delta: true }, _count: { _all: true } }) : [],
        chartAccountIds.length ? db.journalEntryLine.findMany({ where: { chartAccountId: { in: chartAccountIds }, journalEntry: { period: { createdById: accountId } } }, select: { chartAccountId: true, debit: true, credit: true } }) : [],
    ]);
    const movementMap = new Map(movementTotals.map((row) => [row.cashAccountId, row]));
    const operational = accounts.map((account) => {
        const aggregate = movementMap.get(account.id);
        const stored = round2(account.balance);
        const calculated = round2(aggregate?._sum?.delta);
        const difference = round2(stored - calculated);
        return { id: account.id, name: account.name, account_type: account.accountType, is_active: account.isActive, stored_balance: stored, movement_balance: calculated, difference, movement_count: aggregate?._count?._all || 0, status: Math.abs(difference) < 0.005 ? "ok" : "difference", chart_account: account.chartAccount ? { id: account.chartAccount.id, code: account.chartAccount.code, name: account.chartAccount.name } : null };
    });
    const ledgerMap = new Map();
    for (const line of ledgerLines) ledgerMap.set(line.chartAccountId, round2((ledgerMap.get(line.chartAccountId) || 0) + Number(line.debit) - Number(line.credit)));
    const groups = new Map();
    for (const account of accounts.filter((row) => row.chartAccountId)) {
        const group = groups.get(account.chartAccountId) || { chart_account: { id: account.chartAccount.id, code: account.chartAccount.code, name: account.chartAccount.name }, operational_balance: 0, cash_accounts: [] };
        group.operational_balance = round2(group.operational_balance + Number(account.balance));
        group.cash_accounts.push({ id: account.id, name: account.name });
        groups.set(account.chartAccountId, group);
    }
    const accounting = [...groups.entries()].map(([chartAccountId, group]) => {
        const ledgerBalance = round2(ledgerMap.get(chartAccountId));
        const difference = round2(group.operational_balance - ledgerBalance);
        return { ...group, ledger_balance: ledgerBalance, difference, status: Math.abs(difference) < 0.005 ? "ok" : "review" };
    });
    return { generated_at: new Date(), operational, accounting, summary: { cash_accounts: operational.length, operational_differences: operational.filter((row) => row.status !== "ok").length, accounting_groups: accounting.length, accounting_differences: accounting.filter((row) => row.status !== "ok").length } };
};
