import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const dateWhere = (startDate, endDate) =>
    startDate || endDate ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {};

export const listThirdPartyBalances = async ({ accountId, startDate, endDate, type }) => {
    const rows = await prisma.journalEntryLine.groupBy({
        by: ["thirdPartyType", "thirdPartyId", "thirdPartyName", "thirdPartyDocument", "chartAccountId"],
        where: {
            thirdPartyType: type ? type : { not: null },
            thirdPartyId: { not: null },
            journalEntry: { period: { createdById: accountId }, ...dateWhere(startDate, endDate) },
        },
        _sum: { debit: true, credit: true },
    });
    const accountIds = [...new Set(rows.map((row) => row.chartAccountId))];
    const accounts = await prisma.chartAccount.findMany({ where: { id: { in: accountIds }, createdById: accountId } });
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const parties = new Map();
    for (const row of rows) {
        const key = `${row.thirdPartyType}:${row.thirdPartyId}`;
        if (!parties.has(key)) {
            parties.set(key, {
                type: row.thirdPartyType,
                id: row.thirdPartyId,
                name: row.thirdPartyName,
                document: row.thirdPartyDocument,
                balance: 0,
                accounts: [],
            });
        }
        const debit = Number(row._sum.debit || 0);
        const credit = Number(row._sum.credit || 0);
        const balance = Number((debit - credit).toFixed(2));
        const account = accountById.get(row.chartAccountId);
        parties.get(key).balance += balance;
        parties.get(key).accounts.push({
            id: row.chartAccountId,
            code: account?.code,
            name: account?.name,
            debit,
            credit,
            balance,
        });
    }
    return [...parties.values()]
        .map((party) => ({ ...party, balance: Number(party.balance.toFixed(2)) }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

export const getThirdPartyMovements = async ({ accountId, type, id, startDate, endDate }) => {
    if (!type || !id) throw new ApiError(400, "Tipo e identificador del tercero son obligatorios.");
    const [prior, lines] = await Promise.all([
        startDate ? prisma.journalEntryLine.aggregate({
            where: {
                thirdPartyType: type,
                thirdPartyId: id,
                journalEntry: { period: { createdById: accountId }, entryDate: { lt: startDate } },
            },
            _sum: { debit: true, credit: true },
        }) : Promise.resolve({ _sum: { debit: 0, credit: 0 } }),
        prisma.journalEntryLine.findMany({
        where: {
            thirdPartyType: type,
            thirdPartyId: id,
            journalEntry: { period: { createdById: accountId }, ...dateWhere(startDate, endDate) },
        },
        include: {
            chartAccount: { select: { id: true, code: true, name: true } },
            journalEntry: { select: { id: true, entryDate: true, description: true, sourceType: true, sourceId: true } },
        },
        orderBy: [{ journalEntry: { entryDate: "asc" } }, { createdAt: "asc" }],
        }),
    ]);
    const openingBalance = Number(prior._sum.debit || 0) - Number(prior._sum.credit || 0);
    if (!lines.length) return { thirdParty: { type, id }, openingBalance, closingBalance: openingBalance, movements: [] };
    let runningBalance = openingBalance;
    return {
        thirdParty: { type, id, name: lines[0].thirdPartyName, document: lines[0].thirdPartyDocument },
        openingBalance: Number(openingBalance.toFixed(2)),
        closingBalance: Number((openingBalance + lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0)).toFixed(2)),
        movements: lines.map((line) => {
            runningBalance += Number(line.debit) - Number(line.credit);
            return {
                id: line.id,
                entryId: line.journalEntry.id,
                date: line.journalEntry.entryDate,
                description: line.description || line.journalEntry.description,
                sourceType: line.journalEntry.sourceType,
                sourceId: line.journalEntry.sourceId,
                chartAccount: line.chartAccount,
                debit: Number(line.debit),
                credit: Number(line.credit),
                runningBalance: Number(runningBalance.toFixed(2)),
            };
        }),
    };
};
