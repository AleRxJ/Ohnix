import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 20000;

const parseYear = (yearValue) => {
    const year = Number(yearValue);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new ApiError(400, "The note year is invalid.", [], "", "financial_statement_note_invalid_year");
    }
    return year;
};

const validateFields = ({ title, content }) => {
    const trimmedTitle = String(title || "").trim();
    const trimmedContent = String(content || "").trim();
    if (!trimmedTitle) throw new ApiError(400, "Note title is required.", [], "", "financial_statement_note_title_required");
    if (trimmedTitle.length > MAX_TITLE_LENGTH) throw new ApiError(400, "Note title is too long.", [], "", "financial_statement_note_title_too_long");
    if (!trimmedContent) throw new ApiError(400, "Note content is required.", [], "", "financial_statement_note_content_required");
    if (trimmedContent.length > MAX_CONTENT_LENGTH) throw new ApiError(400, "Note content is too long.", [], "", "financial_statement_note_content_too_long");
    return { title: trimmedTitle, content: trimmedContent };
};

export const listFinancialStatementNotes = async (accountId, yearValue) => {
    const year = parseYear(yearValue);
    return prisma.financialStatementNote.findMany({
        where: { accountId, year },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
};

export const createFinancialStatementNote = async ({ accountId, actorId, year: yearValue, title, content }) => {
    const year = parseYear(yearValue);
    const fields = validateFields({ title, content });
    return prisma.$transaction(async (tx) => {
        const count = await tx.financialStatementNote.count({ where: { accountId, year } });
        const note = await tx.financialStatementNote.create({
            data: { accountId, year, ...fields, position: count, createdById: actorId, updatedById: actorId },
        });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "financial_statement_note", entityId: note.id, action: "created", after: { year, title: fields.title } },
        });
        return note;
    });
};

export const updateFinancialStatementNote = async ({ accountId, actorId, id, title, content }) => {
    const fields = validateFields({ title, content });
    return prisma.$transaction(async (tx) => {
        const existing = await tx.financialStatementNote.findFirst({ where: { id, accountId } });
        if (!existing) throw new ApiError(404, "Financial statement note not found.", [], "", "financial_statement_note_not_found");
        const note = await tx.financialStatementNote.update({ where: { id }, data: { ...fields, updatedById: actorId } });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "financial_statement_note", entityId: id, action: "updated", before: { title: existing.title }, after: { title: fields.title } },
        });
        return note;
    });
};

export const deleteFinancialStatementNote = async ({ accountId, actorId, id }) =>
    prisma.$transaction(async (tx) => {
        const existing = await tx.financialStatementNote.findFirst({ where: { id, accountId } });
        if (!existing) throw new ApiError(404, "Financial statement note not found.", [], "", "financial_statement_note_not_found");
        await tx.financialStatementNote.delete({ where: { id } });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "financial_statement_note", entityId: id, action: "deleted", before: { year: existing.year, title: existing.title } },
        });
    });
