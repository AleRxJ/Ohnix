import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordJournalEntry } from "./journalEntry.service.js";

const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 28;
const cents = (value) => Math.round(Number(value) * 100);

const templateInclude = {
    lines: { orderBy: { position: "asc" }, include: { chartAccount: { select: { id: true, code: true, name: true } }, costCenter: { select: { id: true, code: true, name: true } } } },
};

const mapTemplate = (template) => ({
    _id: template.id,
    description: template.description,
    day_of_month: template.dayOfMonth,
    is_active: template.isActive,
    last_generated_period: template.lastGeneratedPeriod,
    last_run_status: template.lastRunStatus,
    last_run_error: template.lastRunError,
    lines: template.lines.map((line) => ({
        _id: line.id,
        chart_account: { _id: line.chartAccount.id, code: line.chartAccount.code, name: line.chartAccount.name },
        cost_center: line.costCenter ? { _id: line.costCenter.id, code: line.costCenter.code, name: line.costCenter.name } : null,
        debit: Number(line.debit),
        credit: Number(line.credit),
        description: line.description,
        third_party: line.thirdPartyType ? { type: line.thirdPartyType, id: line.thirdPartyId, name: line.thirdPartyName, document: line.thirdPartyDocument } : null,
    })),
    created_at: template.createdAt,
    updated_at: template.updatedAt,
});

// Identical validation shape to manualJournalVoucher.service.js#validateLines
// (fixed peso amounts here instead - a recurring template has no tax
// decomposition to redo each month, the user already set the amount they
// want repeated).
const validateLines = async (accountId, lines) => {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw new ApiError(400, "The template must contain at least two lines.", [], "", "recurring_journal_lines_required");
    }
    const normalized = lines.map((line, position) => {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        if (!line.chart_account_id || !Number.isFinite(debit) || !Number.isFinite(credit)) {
            throw new ApiError(400, `Template line ${position + 1} is invalid.`, [], "", "recurring_journal_line_invalid");
        }
        if ((debit > 0) === (credit > 0) || debit < 0 || credit < 0) {
            throw new ApiError(400, `Template line ${position + 1} must have either debit or credit, not both.`, [], "", "recurring_journal_line_side_invalid");
        }
        const thirdParty = line.third_party || null;
        if (thirdParty && !["customer", "supplier", "other"].includes(thirdParty.type)) {
            throw new ApiError(400, `Third-party type on template line ${position + 1} is invalid.`, [], "", "recurring_journal_third_party_type_invalid");
        }
        if (thirdParty && !String(thirdParty.name || "").trim()) {
            throw new ApiError(400, `Third-party name on template line ${position + 1} is required.`, [], "", "recurring_journal_third_party_name_required");
        }
        return {
            chartAccountId: line.chart_account_id,
            costCenterId: line.cost_center_id || null,
            debit: debit > 0 ? debit : 0,
            credit: credit > 0 ? credit : 0,
            description: String(line.description || "").trim() || null,
            position,
            thirdPartyType: thirdParty?.type || null,
            thirdPartyId: thirdParty?.id || (thirdParty?.type === "other" ? `other:${String(thirdParty.document || thirdParty.name).trim().toLowerCase()}` : null),
            thirdPartyName: String(thirdParty?.name || "").trim() || null,
            thirdPartyDocument: String(thirdParty?.document || "").trim() || null,
        };
    });

    const accountIds = [...new Set(normalized.map((line) => line.chartAccountId))];
    const accounts = await prisma.chartAccount.findMany({ where: { id: { in: accountIds }, createdById: accountId, isActive: true }, select: { id: true } });
    if (accounts.length !== accountIds.length) {
        throw new ApiError(400, "One or more accounts do not exist, are inactive, or belong to another company.", [], "", "recurring_journal_accounts_invalid");
    }
    const costCenterIds = [...new Set(normalized.map((line) => line.costCenterId).filter(Boolean))];
    if (costCenterIds.length) {
        const count = await prisma.costCenter.count({ where: { id: { in: costCenterIds }, accountId, isActive: true } });
        if (count !== costCenterIds.length) throw new ApiError(400, "One or more cost centers do not exist, are inactive, or belong to another company.", [], "", "recurring_journal_cost_centers_invalid");
    }

    const totalDebit = normalized.reduce((sum, line) => sum + cents(line.debit), 0);
    const totalCredit = normalized.reduce((sum, line) => sum + cents(line.credit), 0);
    if (totalDebit !== totalCredit) throw new ApiError(400, "The template is unbalanced: total debits must equal total credits.", [], "", "recurring_journal_unbalanced");

    return normalized;
};

const validateHeader = ({ description, dayOfMonth }) => {
    const trimmedDescription = String(description || "").trim();
    const day = Number(dayOfMonth);
    if (!trimmedDescription) throw new ApiError(400, "Template description is required.", [], "", "recurring_journal_description_required");
    if (trimmedDescription.length > 160) throw new ApiError(400, "Template description is too long.", [], "", "recurring_journal_description_too_long");
    if (!Number.isInteger(day) || day < MIN_DAY_OF_MONTH || day > MAX_DAY_OF_MONTH) {
        throw new ApiError(400, `The day of month must be between ${MIN_DAY_OF_MONTH} and ${MAX_DAY_OF_MONTH}.`, [], "", "recurring_journal_day_invalid");
    }
    return { description: trimmedDescription, dayOfMonth: day };
};

export const listRecurringJournalTemplates = (accountId, { includeInactive = false } = {}) =>
    prisma.recurringJournalTemplate
        .findMany({ where: { createdById: accountId, ...(includeInactive ? {} : { isActive: true }) }, include: templateInclude, orderBy: [{ description: "asc" }] })
        .then((rows) => rows.map(mapTemplate));

export const createRecurringJournalTemplate = async (accountId, payload) => {
    const header = validateHeader({ description: payload.description, dayOfMonth: payload.day_of_month });
    const lines = await validateLines(accountId, payload.lines);
    const template = await prisma.recurringJournalTemplate.create({
        data: { createdById: accountId, ...header, lines: { create: lines } },
        include: templateInclude,
    });
    return mapTemplate(template);
};

export const updateRecurringJournalTemplate = async (accountId, id, payload) => {
    const current = await prisma.recurringJournalTemplate.findFirst({ where: { id, createdById: accountId }, include: templateInclude });
    if (!current) throw new ApiError(404, "Recurring journal template not found.", [], "", "recurring_journal_not_found");

    const header = validateHeader({
        description: payload.description ?? current.description,
        dayOfMonth: payload.day_of_month ?? current.dayOfMonth,
    });
    const lines = await validateLines(accountId, payload.lines ?? current.lines.map((line) => ({
        chart_account_id: line.chartAccountId,
        cost_center_id: line.costCenterId,
        debit: Number(line.debit),
        credit: Number(line.credit),
        description: line.description,
        third_party: line.thirdPartyType ? { type: line.thirdPartyType, id: line.thirdPartyId, name: line.thirdPartyName, document: line.thirdPartyDocument } : null,
    })));
    const isActive = typeof payload.is_active === "boolean" ? payload.is_active : current.isActive;

    await prisma.recurringJournalTemplateLine.deleteMany({ where: { templateId: id } });
    const template = await prisma.recurringJournalTemplate.update({
        where: { id },
        data: { ...header, isActive, lines: { create: lines } },
        include: templateInclude,
    });
    return mapTemplate(template);
};

// Shared by the cron and "generar ahora" - posts the template's lines
// exactly as configured, tagged with this month so a report can tell which
// occurrence produced it.
const postTemplateJournal = async (tx, accountId, actorId, template, entryDate, period) => {
    const entry = await recordJournalEntry(tx, {
        accountId,
        createdById: actorId,
        entryDate,
        description: `${template.description} (${period})`,
        sourceType: "recurring_journal",
        sourceId: template.id,
        lines: template.lines.map((line) => ({
            chartAccountId: line.chartAccountId,
            costCenterId: line.costCenterId,
            debit: Number(line.debit),
            credit: Number(line.credit),
            description: line.description,
            thirdPartyType: line.thirdPartyType,
            thirdPartyId: line.thirdPartyId,
            thirdPartyName: line.thirdPartyName,
            thirdPartyDocument: line.thirdPartyDocument,
        })),
    });
    return entry;
};

// "America/Bogota" by default - same override recurringExpense.service.js/
// fixedAsset.service.js use.
const currentLocalParts = (tz) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type).value;
    return { year: get("year"), month: get("month"), day: Number(get("day")) };
};

const resolveTimezone = () => {
    const tz = process.env.TIMEZONE || "America/Bogota";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz;
    } catch {
        return "UTC";
    }
};

export const runRecurringJournalTemplateNow = async (accountId, actorId, id) => {
    const template = await prisma.recurringJournalTemplate.findFirst({ where: { id, createdById: accountId }, include: templateInclude });
    if (!template) throw new ApiError(404, "Recurring journal template not found.", [], "", "recurring_journal_not_found");
    if (!template.isActive) throw new ApiError(400, "The recurring journal template is inactive.", [], "", "recurring_journal_inactive");

    const { year, month } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;
    if (template.lastGeneratedPeriod === period) {
        throw new ApiError(409, "This recurring journal template was already generated for the current period.", [], "", "recurring_journal_already_generated");
    }

    try {
        const entry = await prisma.$transaction(
            (tx) => postTemplateJournal(tx, accountId, actorId, template, new Date(), period),
            { isolationLevel: "Serializable" }
        );
        await prisma.recurringJournalTemplate.update({ where: { id }, data: { lastGeneratedPeriod: period, lastRunStatus: "success", lastRunError: null } });
        return entry;
    } catch (err) {
        await prisma.recurringJournalTemplate.update({ where: { id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "recurring_journal_generation_failed" } });
        throw err instanceof ApiError ? err : new ApiError(422, "The recurring journal entry could not be generated.", [], "", "recurring_journal_generation_failed");
    }
};

// Called daily by recurringJournalScheduler.js across every tenant - same
// shape as recurringExpense.service.js#generateDueRecurringExpenses.
export const generateDueRecurringJournals = async () => {
    const { year, month, day } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;

    const dueTemplates = await prisma.recurringJournalTemplate.findMany({
        where: { isActive: true, dayOfMonth: { lte: day }, lastGeneratedPeriod: { not: period } },
        include: templateInclude,
    });

    let posted = 0;
    let failed = 0;
    for (const template of dueTemplates) {
        try {
            await prisma.$transaction(
                (tx) => postTemplateJournal(tx, template.createdById, template.createdById, template, new Date(), period),
                { isolationLevel: "Serializable" }
            );
            await prisma.recurringJournalTemplate.update({ where: { id: template.id }, data: { lastGeneratedPeriod: period, lastRunStatus: "success", lastRunError: null } });
            posted++;
        } catch (err) {
            await prisma.recurringJournalTemplate.update({ where: { id: template.id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "recurring_journal_generation_failed" } });
            failed++;
        }
    }
    return { checked: dueTemplates.length, posted, failed };
};
