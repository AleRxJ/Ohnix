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
        throw new ApiError(400, "El enlace de soporte debe ser una URL HTTP o HTTPS válida.");
    }
};

const validateHeader = ({ entryDate, description }) => {
    const parsedDate = new Date(entryDate);
    if (Number.isNaN(parsedDate.getTime())) throw new ApiError(400, "La fecha del comprobante no es válida.");
    if (!String(description || "").trim()) throw new ApiError(400, "La descripción del comprobante es obligatoria.");
    return { entryDate: parsedDate, description: String(description).trim() };
};

const validateLines = async (tx, accountId, lines, { requireBalanced = false } = {}) => {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw new ApiError(400, "El comprobante debe contener al menos dos líneas.");
    }
    const normalized = lines.map((line, position) => {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        if (!line.chart_account_id || !Number.isFinite(debit) || !Number.isFinite(credit)) {
            throw new ApiError(400, `La línea ${position + 1} no es válida.`);
        }
        if ((debit > 0) === (credit > 0) || debit < 0 || credit < 0) {
            throw new ApiError(400, `La línea ${position + 1} debe tener débito o crédito, pero no ambos.`);
        }
        const thirdParty = line.third_party || null;
        if (thirdParty && !["customer", "supplier", "other"].includes(thirdParty.type)) {
            throw new ApiError(400, `El tipo de tercero de la línea ${position + 1} no es válido.`);
        }
        if (thirdParty && !String(thirdParty.name || "").trim()) {
            throw new ApiError(400, `El nombre del tercero de la línea ${position + 1} es obligatorio.`);
        }
        return {
            chartAccountId: line.chart_account_id,
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
        throw new ApiError(400, "Una o más cuentas no existen, están inactivas o pertenecen a otra empresa.");
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    for (const line of normalized) {
        if (["1305", "2205"].includes(accountById.get(line.chartAccountId)?.code) && !line.thirdPartyType) {
            throw new ApiError(400, "Las líneas de Clientes o Proveedores deben identificar un tercero.");
        }
    }

    const totalDebit = normalized.reduce((sum, line) => sum + cents(line.debit), 0);
    const totalCredit = normalized.reduce((sum, line) => sum + cents(line.credit), 0);
    if (requireBalanced && totalDebit !== totalCredit) {
        throw new ApiError(400, "El comprobante no cuadra: débitos y créditos deben ser iguales.", [], "", "manual_voucher_unbalanced");
    }
    return normalized;
};

const includeVoucher = {
    lines: { orderBy: { position: "asc" }, include: { chartAccount: true } },
};

const lockVoucher = async (tx, accountId, id) => {
    const rows = await tx.$queryRaw`
        SELECT id FROM manual_journal_vouchers
        WHERE id = ${id} AND account_id = ${accountId}
        FOR UPDATE
    `;
    if (!rows.length) throw new ApiError(404, "Comprobante contable no encontrado.");
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
        if (voucher.status !== "draft") throw new ApiError(409, "Solo se pueden modificar comprobantes en borrador.");
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
        if (voucher.status !== "draft") throw new ApiError(409, "El comprobante ya fue contabilizado o anulado.");
        const lines = await validateLines(
            tx,
            accountId,
            voucher.lines.map((line) => ({
                chart_account_id: line.chartAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
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
            throw new ApiError(409, "Solo se puede anular un comprobante contabilizado.");
        }
        if (!String(reason || "").trim()) throw new ApiError(400, "El motivo de anulación es obligatorio.");
        const reversalDate = new Date(entryDate);
        if (Number.isNaN(reversalDate.getTime())) throw new ApiError(400, "La fecha de anulación no es válida.");
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
                thirdPartyType: line.thirdPartyType,
                thirdPartyId: line.thirdPartyId,
                thirdPartyName: line.thirdPartyName,
                thirdPartyDocument: line.thirdPartyDocument,
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
    if (!voucher) throw new ApiError(404, "Comprobante contable no encontrado.");
    return voucher;
};
