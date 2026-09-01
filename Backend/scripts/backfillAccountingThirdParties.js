import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";
import { buildAccountingThirdParty } from "../services/accountingPosting.service.js";

dotenv.config();

const apply = process.argv.includes("--apply");

const resolveParty = async (entry) => {
    if (entry.sourceType === "order_sale") {
        const order = await prisma.order.findUnique({
            where: { id: entry.sourceId },
            select: { createdById: true, customer: { select: { id: true, name: true, identification: true } } },
        });
        return order ? { accountId: order.createdById, party: buildAccountingThirdParty("customer", order.customer) } : null;
    }
    if (entry.sourceType === "purchase") {
        const purchase = await prisma.purchase.findUnique({
            where: { id: entry.sourceId },
            select: { createdById: true, supplier: { select: { id: true, name: true, identification: true } } },
        });
        return purchase ? { accountId: purchase.createdById, party: buildAccountingThirdParty("supplier", purchase.supplier) } : null;
    }
    return null;
};

const main = async () => {
    const lines = await prisma.journalEntryLine.findMany({
        where: {
            chartAccount: { code: { in: ["1305", "2205"] } },
            OR: [
                { thirdPartyType: null },
                { thirdPartyId: null },
                { thirdPartyName: null },
            ],
        },
        select: {
            id: true,
            thirdPartyType: true,
            thirdPartyId: true,
            thirdPartyName: true,
            journalEntry: { select: { id: true, sourceType: true, sourceId: true, createdById: true } },
            chartAccount: { select: { code: true, createdById: true } },
        },
        orderBy: { createdAt: "asc" },
    });

    const candidates = [];
    const unresolved = [];
    for (const line of lines) {
        const resolved = await resolveParty(line.journalEntry);
        if (!resolved?.party || !line.journalEntry.sourceId || resolved.accountId !== line.journalEntry.createdById || resolved.accountId !== line.chartAccount.createdById) {
            unresolved.push({ line_id: line.id, entry_id: line.journalEntry.id, source_type: line.journalEntry.sourceType, source_id: line.journalEntry.sourceId });
            continue;
        }
        candidates.push({
            line_id: line.id,
            entry_id: line.journalEntry.id,
            source_type: line.journalEntry.sourceType,
            source_id: line.journalEntry.sourceId,
            account_code: line.chartAccount.code,
            party: resolved.party,
        });
    }

    const report = { mode: apply ? "apply" : "dry-run", scanned: lines.length, candidates: candidates.length, unresolved, updated: 0, conflicts: [], details: candidates };
    if (apply && unresolved.length) throw new Error(`Backfill blocked: ${unresolved.length} control-account line(s) cannot be resolved unambiguously.`);

    if (apply) {
        for (const candidate of candidates) {
            const result = await prisma.journalEntryLine.updateMany({
                where: {
                    id: candidate.line_id,
                    OR: [{ thirdPartyType: null }, { thirdPartyId: null }, { thirdPartyName: null }],
                },
                data: {
                    thirdPartyType: candidate.party.type,
                    thirdPartyId: candidate.party.id,
                    thirdPartyName: candidate.party.name,
                    thirdPartyDocument: candidate.party.document,
                },
            });
            if (result.count === 1) report.updated += 1;
            else report.conflicts.push(candidate.line_id);
        }
    }

    console.log(JSON.stringify(report, null, 2));
    if (report.conflicts.length) process.exitCode = 2;
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
