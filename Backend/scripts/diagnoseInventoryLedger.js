import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

const round2 = (value) => Number(Number(value).toFixed(2));

const main = async () => {
    const accounts = await prisma.chartAccount.findMany({
        where: { code: "1435" },
        select: {
            createdById: true,
            journalEntryLines: {
                select: {
                    debit: true,
                    credit: true,
                    journalEntry: { select: { id: true, sourceType: true, sourceId: true, entryDate: true, description: true } },
                },
                orderBy: { createdAt: "asc" },
            },
        },
    });

    const report = [];
    for (const account of accounts) {
        const locations = await prisma.productLocationStock.findMany({
            where: { product: { createdById: account.createdById } },
            select: { inventoryValue: true },
        });
        const stockValue = round2(locations.reduce((sum, row) => sum + Number(row.inventoryValue), 0));
        const ledgerValue = round2(account.journalEntryLines.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0));
        if (Math.abs(stockValue - ledgerValue) <= 0.01) continue;

        const bySource = {};
        for (const line of account.journalEntryLines) {
            const key = line.journalEntry.sourceType;
            bySource[key] ||= { entries: 0, balance: 0 };
            bySource[key].entries += 1;
            bySource[key].balance += Number(line.debit) - Number(line.credit);
        }
        for (const value of Object.values(bySource)) value.balance = round2(value.balance);

        report.push({
            account_id: account.createdById,
            stock_value: stockValue,
            ledger_value: ledgerValue,
            difference: round2(stockValue - ledgerValue),
            ledger_by_source: bySource,
            largest_lines: account.journalEntryLines
                .map((line) => ({
                    entry_id: line.journalEntry.id,
                    source_type: line.journalEntry.sourceType,
                    source_id: line.journalEntry.sourceId,
                    entry_date: line.journalEntry.entryDate,
                    description: line.journalEntry.description,
                    amount: round2(Number(line.debit) - Number(line.credit)),
                }))
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
                .slice(0, 10),
        });
    }

    console.log(JSON.stringify({ readOnly: true, discrepancies: report.length, accounts: report }, null, 2));
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
