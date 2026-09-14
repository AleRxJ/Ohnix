import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const reverseJournalEntry = async ({ accountId, actorId, id, reason, entryDate = new Date() }) => {
    if (!String(reason || "").trim()) throw new ApiError(400, "A reversal reason is required.", [], "", "journal_reversal_reason_required");
    const date = new Date(entryDate);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "Reversal date is invalid.", [], "", "journal_reversal_date_invalid");
    return prisma.$transaction(async (tx) => {
        const original = await tx.journalEntry.findFirst({ where: { id, period: { createdById: accountId } }, include: { lines: true } });
        if (!original) throw new ApiError(404, "Journal entry not found.", [], "", "journal_entry_not_found");
        if (["period_close", "period_reopen", "period_reclose", "manual_journal_reversal"].includes(original.sourceType)) throw new ApiError(409, "This journal entry cannot be reversed.", [], "", "journal_reversal_not_allowed");
        const reversal = await recordJournalEntry(tx, { accountId, createdById: actorId, entryDate: date, description: `Reversal: ${original.description || original.sourceType}. ${String(reason).trim()}`, sourceType: "manual_journal_reversal", sourceId: original.id, lines: original.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: Number(line.credit), credit: Number(line.debit), description: line.description, costCenterId: line.costCenterId, thirdPartyType: line.thirdPartyType, thirdPartyId: line.thirdPartyId, thirdPartyName: line.thirdPartyName, thirdPartyDocument: line.thirdPartyDocument })) });
        return { originalId: original.id, reversalId: reversal.id };
    });
};
