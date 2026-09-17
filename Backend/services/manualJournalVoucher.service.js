import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordJournalEntry } from "./journalEntry.service.js";

const cents = (value) => Math.round(Number(value) * 100);

const normalizeSupportUrl = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    try {
        const url = new URL(normalized);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        return url.toString();
    } catch {
        throw new ApiError(400, "Support link must be a valid HTTP or HTTPS URL.", [], "", "manual_voucher_support_url_invalid");
    }
};

const validateHeader = ({ entryDate, description }) => {
    const parsedDate = new Date(entryDate);
    if (Number.isNaN(parsedDate.getTime())) throw new ApiError(400, "Voucher date is invalid.", [], "", "manual_voucher_date_invalid");
    if (!String(description || "").trim()) throw new ApiError(400, "Voucher description is required.", [], "", "manual_voucher_description_required");
    return { entryDate: parsedDate, description: String(description).trim() };
};

const validateLines = async (tx, accountId, lines, { requireBalanced = false } = {}) => {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw new ApiError(400, "Voucher must contain at least two lines.", [], "", "manual_voucher_lines_required");
    }
    const normalized = lines.map((line, position) => {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        if (!line.chart_account_id || !Number.isFinite(debit) || !Number.isFinite(credit)) {
            throw new ApiError(400, `Voucher line ${position + 1} is invalid.`, [], "", "manual_voucher_line_invalid");
        }
        if ((debit > 0) === (credit > 0) || debit < 0 || credit < 0) {
            throw new ApiError(400, `Voucher line ${position + 1} must have either debit or credit, not both.`, [], "", "manual_voucher_line_side_invalid");
        }
        const thirdParty = line.third_party || null;
        if (thirdParty && !["customer", "supplier", "other"].includes(thirdParty.type)) {
            throw new ApiError(400, `Third-party type on voucher line ${position + 1} is invalid.`, [], "", "manual_voucher_third_party_type_invalid");
        }
        if (thirdParty && !String(thirdParty.name || "").trim()) {
            throw new ApiError(400, `Third-party name on voucher line ${position + 1} is required.`, [], "", "manual_voucher_third_party_name_required");
        }
        return {
            chartAccountId: line.chart_account_id,
            costCenterId: line.cost_center_id || null,
            debit: debit > 0 ? debit : 0,
            credit: credit > 0 ? credit : 0,
            description: String(line.description || "").trim() || null,
            position,
            thirdPartyType: thirdParty?.type || null,
            thirdPartyId: thirdParty?.id || (thirdParty?.type === "other"
                ? `other:${String(thirdParty.document || thirdParty.name).trim().toLowerCase()}`
                : null),
            thirdPartyName: String(thirdParty?.name || "").trim() || null,
            thirdPartyDocument: String(thirdParty?.document || "").trim() || null,
        };
    });

    const accountIds = [...new Set(normalized.map((line) => line.chartAccountId))];
    const accounts = await tx.chartAccount.findMany({
        where: { id: { in: accountIds }, createdById: accountId, isActive: true },
        select: { id: true, code: true },
    });
    if (accounts.length !== accountIds.length) {
        throw new ApiError(400, "One or more accounts do not exist, are inactive, or belong to another company.", [], "", "manual_voucher_accounts_invalid");
    }
    const costCenterIds = [...new Set(normalized.map((line) => line.costCenterId).filter(Boolean))];
    if (costCenterIds.length) {
        const costCenterCount = await tx.costCenter.count({
            where: { id: { in: costCenterIds }, accountId, isActive: true },
        });
        if (costCenterCount !== costCenterIds.length) {
            throw new ApiError(400, "One or more cost centers do not exist, are inactive, or belong to another company.", [], "", "manual_voucher_cost_centers_invalid");
        }
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    for (const line of normalized) {
        if (["1305", "2205"].includes(accountById.get(line.chartAccountId)?.code) && !line.thirdPartyType) {
            throw new ApiError(400, "Customer or supplier lines must identify a third party.", [], "", "manual_voucher_third_party_required");
        }
    }

    const totalDebit = normalized.reduce((sum, line) => sum + cents(line.debit), 0);
    const totalCredit = normalized.reduce((sum, line) => sum + cents(line.credit), 0);
    if (requireBalanced && totalDebit !== totalCredit) {
        throw new ApiError(400, "Voucher is unbalanced: total debits and credits must be equal.", [], "", "manual_voucher_unbalanced");
    }
    return normalized;
};

const includeVoucher = {
    lines: { orderBy: { position: "asc" }, include: { chartAccount: true, costCenter: true } },
};

// Maker-checker only means something when there's someone else who could do
// the checking - a solo owner (no team, or a team where nobody else has
// accounting edit/admin) must still be able to post their own vouchers, or
// this control would just lock them out of their own books. The owner
// always counts as 1 (canAccessModule's "solo users are never gated" rule -
// see team.permissions.js) plus any ACTIVE team member whose role grants
// "accounting" edit or admin.
const countEligibleApprovers = async (tx, accountId) => {
    const otherApprovers = await tx.teamMember.count({
        where: {
            status: "active",
            team: { ownerId: accountId },
            role: { permissions: { some: { moduleKey: "accounting", level: { in: ["edit", "admin"] } } } },
        },
    });
    return 1 + otherApprovers;
};

const lockVoucher = async (tx, accountId, id) => {
    const rows = await tx.$queryRaw`
        SELECT id FROM manual_journal_vouchers
        WHERE id = ${id} AND account_id = ${accountId}
        FOR UPDATE
    `;
    if (!rows.length) throw new ApiError(404, "Journal voucher not found.", [], "", "manual_voucher_not_found");
    return tx.manualJournalVoucher.findUniqueOrThrow({ where: { id }, include: includeVoucher });
};

export const createDraft = async ({ accountId, actorId, entryDate, description, supportUrl, lines }) =>
    prisma.$transaction(async (tx) => {
        const header = validateHeader({ entryDate, description });
        const normalizedLines = await validateLines(tx, accountId, lines);
        return tx.manualJournalVoucher.create({
            data: {
                accountId,
                createdById: actorId,
                ...header,
                supportUrl: normalizeSupportUrl(supportUrl),
                lines: { create: normalizedLines },
            },
            include: includeVoucher,
        });
    });

export const updateDraft = async ({ accountId, id, entryDate, description, supportUrl, lines }) =>
    prisma.$transaction(async (tx) => {
        const voucher = await lockVoucher(tx, accountId, id);
        if (voucher.status !== "draft") throw new ApiError(409, "Only draft vouchers can be edited.", [], "", "manual_voucher_not_draft");
        const header = validateHeader({ entryDate, description });
        const normalizedLines = await validateLines(tx, accountId, lines);
        await tx.manualJournalVoucherLine.deleteMany({ where: { voucherId: id } });
        return tx.manualJournalVoucher.update({
            where: { id },
            data: {
                ...header,
                supportUrl: normalizeSupportUrl(supportUrl),
                lines: { create: normalizedLines },
            },
            include: includeVoucher,
        });
    });

export const postDraft = async ({ accountId, actorId, id }) =>
    prisma.$transaction(async (tx) => {
        const voucher = await lockVoucher(tx, accountId, id);
        if (voucher.status !== "draft") throw new ApiError(409, "Voucher has already been posted or voided.", [], "", "manual_voucher_already_processed");

        if (voucher.createdById === actorId && (await countEligibleApprovers(tx, accountId)) > 1) {
            throw new ApiError(403, "A different user must post this voucher.", [], "", "manual_voucher_self_post_not_allowed");
        }

        const lines = await validateLines(
            tx,
            accountId,
            voucher.lines.map((line) => ({
                chart_account_id: line.chartAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
                cost_center_id: line.costCenterId,
                third_party: line.thirdPartyType ? {
                    type: line.thirdPartyType,
                    id: line.thirdPartyId,
                    name: line.thirdPartyName,
                    document: line.thirdPartyDocument,
                } : null,
            })),
            { requireBalanced: true }
        );
        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: voucher.entryDate,
            description: voucher.description,
            sourceType: "manual_journal",
            sourceId: voucher.id,
            lines,
        });
        return tx.manualJournalVoucher.update({
            where: { id },
            data: { status: "posted", postedEntryId: entry.id, postedById: actorId, postedAt: new Date() },
            include: includeVoucher,
        });
    });

export const voidPosted = async ({ accountId, actorId, id, reason, entryDate = new Date() }) =>
    prisma.$transaction(async (tx) => {
        const voucher = await lockVoucher(tx, accountId, id);
        if (voucher.status !== "posted" || !voucher.postedEntryId) {
            throw new ApiError(409, "Only a posted voucher can be voided.", [], "", "manual_voucher_not_posted");
        }
        if (!String(reason || "").trim()) throw new ApiError(400, "Void reason is required.", [], "", "manual_voucher_void_reason_required");
        const reversalDate = new Date(entryDate);
        if (Number.isNaN(reversalDate.getTime())) throw new ApiError(400, "Void date is invalid.", [], "", "manual_voucher_void_date_invalid");
        const posted = await tx.journalEntry.findUniqueOrThrow({
            where: { id: voucher.postedEntryId },
            include: { lines: true },
        });
        const reversal = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: reversalDate,
            description: `Anulación: ${voucher.description}. ${String(reason).trim()}`,
            sourceType: "manual_journal_reversal",
            sourceId: voucher.id,
            lines: posted.lines.map((line) => ({
                chartAccountId: line.chartAccountId,
                debit: Number(line.credit),
                credit: Number(line.debit),
                description: line.description,
                costCenterId: line.costCenterId,
                thirdPartyType: line.thirdPartyType,
                thirdPartyId: line.thirdPartyId,
                thirdPartyName: line.thirdPartyName,
                thirdPartyDocument: line.thirdPartyDocument,
                costCenterId: line.costCenterId,
            })),
        });
        return tx.manualJournalVoucher.update({
            where: { id },
            data: {
                status: "voided",
                reversalEntryId: reversal.id,
                voidedById: actorId,
                voidedAt: new Date(),
                voidReason: String(reason).trim(),
            },
            include: includeVoucher,
        });
    });

export const listVouchers = ({ accountId, status }) =>
    prisma.manualJournalVoucher.findMany({
        where: { accountId, ...(status ? { status } : {}) },
        include: includeVoucher,
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 200,
    });

export const getVoucher = async ({ accountId, id }) => {
    const voucher = await prisma.manualJournalVoucher.findFirst({
        where: { id, accountId },
        include: includeVoucher,
    });
    if (!voucher) throw new ApiError(404, "Journal voucher not found.", [], "", "manual_voucher_not_found");
    return voucher;
};
