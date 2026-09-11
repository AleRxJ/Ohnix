import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordJournalEntry } from "./journalEntry.service.js";

const cents = (value) => Math.round(Number(value || 0) * 100);

export const createOpeningBalance = async ({ accountId, actorId, entryDate, description, lines }) => {
    const date = new Date(entryDate);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "Opening balance date is invalid.", [], "", "opening_balance_date_invalid");
    if (!Array.isArray(lines) || lines.length < 2) throw new ApiError(400, "Opening balance needs at least two lines.", [], "", "opening_balance_lines_required");
    const normalized = lines.map((line) => ({ chartAccountId: line.chart_account_id, debit: Number(line.debit || 0), credit: Number(line.credit || 0), costCenterId: line.cost_center_id || null, thirdPartyType: line.third_party?.type || null, thirdPartyId: line.third_party?.id || null, thirdPartyName: line.third_party?.name || null, thirdPartyDocument: line.third_party?.document || null, description: line.description || null }));
    if (normalized.some((line) => !line.chartAccountId || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0))) throw new ApiError(400, "Each opening balance line must contain either a positive debit or credit.", [], "", "opening_balance_line_invalid");
    if (normalized.reduce((sum, line) => sum + cents(line.debit), 0) !== normalized.reduce((sum, line) => sum + cents(line.credit), 0)) throw new ApiError(400, "Opening balance debits and credits must be equal.", [], "", "opening_balance_unbalanced");
    return prisma.$transaction(async (tx) => {
        const existing = await tx.journalEntry.findFirst({ where: { period: { createdById: accountId }, sourceType: "opening_balance" } });
        if (existing) throw new ApiError(409, "An opening balance already exists for this company.", [], "", "opening_balance_already_exists");
        const ids = [...new Set(normalized.map((line) => line.chartAccountId))];
        const accounts = await tx.chartAccount.findMany({ where: { id: { in: ids }, createdById: accountId, isActive: true }, select: { id: true } });
        if (accounts.length !== ids.length) throw new ApiError(400, "One or more opening balance accounts are invalid.", [], "", "opening_balance_accounts_invalid");
        return recordJournalEntry(tx, { accountId, createdById: actorId, entryDate: date, description: description?.trim() || "Opening balance", sourceType: "opening_balance", sourceId: `opening:${accountId}`, lines: normalized });
    }, { isolationLevel: "Serializable" });
};
