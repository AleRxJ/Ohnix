import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const normalize = (value) => String(value || "").trim();

export const listCostCenters = (accountId, { includeInactive = false } = {}) =>
    prisma.costCenter.findMany({
        where: { accountId, ...(includeInactive ? {} : { isActive: true }) },
        orderBy: [{ code: "asc" }, { name: "asc" }],
    });

export const createCostCenter = async (accountId, actorId, payload) => {
    const code = normalize(payload.code).toUpperCase();
    const name = normalize(payload.name);
    if (!code || !name) throw new ApiError(400, "Cost center code and name are required.", [], "", "cost_center_fields_required");
    if (code.length > 30 || name.length > 120) throw new ApiError(400, "The cost center exceeds the allowed length.", [], "", "cost_center_length_invalid");
    const duplicate = await prisma.costCenter.findUnique({ where: { accountId_code: { accountId, code } } });
    if (duplicate) throw new ApiError(409, "A cost center with that code already exists.", [], "", "cost_center_code_duplicate");
    return prisma.$transaction(async (tx) => {
        const center = await tx.costCenter.create({ data: { accountId, code, name } });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "cost_center", entityId: center.id, action: "created", after: { code, name, is_active: true } },
        });
        return center;
    });
};

export const updateCostCenter = async (accountId, actorId, id, payload) =>
    prisma.$transaction(async (tx) => {
        const current = await tx.costCenter.findFirst({ where: { id, accountId } });
        if (!current) throw new ApiError(404, "Cost center not found.", [], "", "cost_center_not_found");
        const code = normalize(payload.code ?? current.code).toUpperCase();
        const name = normalize(payload.name ?? current.name);
        const isActive = typeof payload.is_active === "boolean" ? payload.is_active : current.isActive;
        if (!code || !name) throw new ApiError(400, "Cost center code and name are required.", [], "", "cost_center_fields_required");
        if (code.length > 30 || name.length > 120) throw new ApiError(400, "The cost center exceeds the allowed length.", [], "", "cost_center_length_invalid");
        const duplicate = await tx.costCenter.findFirst({ where: { accountId, code, id: { not: id } } });
        if (duplicate) throw new ApiError(409, "A cost center with that code already exists.", [], "", "cost_center_code_duplicate");
        const center = await tx.costCenter.update({ where: { id }, data: { code, name, isActive } });
        await tx.accountingConfigAudit.create({
            data: {
                accountId, actorId, entityType: "cost_center", entityId: id, action: "updated",
                before: { code: current.code, name: current.name, is_active: current.isActive },
                after: { code, name, is_active: isActive },
            },
        });
        return center;
    });

export const getCostCenterLedger = async (accountId, id, { startDate, endDate } = {}) => {
    const center = await prisma.costCenter.findFirst({ where: { id, accountId } });
    if (!center) throw new ApiError(404, "Cost center not found.", [], "", "cost_center_not_found");
    const lines = await prisma.journalEntryLine.findMany({
        where: {
            costCenterId: id,
            journalEntry: {
                period: { createdById: accountId },
                ...(startDate || endDate ? { entryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
            },
        },
        include: {
            chartAccount: { select: { id: true, code: true, name: true, accountType: true } },
            journalEntry: { select: { id: true, entryDate: true, description: true, sourceType: true, sourceId: true } },
        },
        orderBy: [{ journalEntry: { entryDate: "asc" } }, { createdAt: "asc" }],
    });
    return {
        center,
        total_debit: Number(lines.reduce((sum, line) => sum + Number(line.debit), 0).toFixed(2)),
        total_credit: Number(lines.reduce((sum, line) => sum + Number(line.credit), 0).toFixed(2)),
        movements: lines.map((line) => ({
            id: line.id,
            entry_id: line.journalEntry.id,
            date: line.journalEntry.entryDate,
            description: line.description || line.journalEntry.description,
            source_type: line.journalEntry.sourceType,
            source_id: line.journalEntry.sourceId,
            chart_account: { id: line.chartAccount.id, code: line.chartAccount.code, name: line.chartAccount.name, account_type: line.chartAccount.accountType },
            debit: Number(line.debit),
            credit: Number(line.credit),
        })),
    };
};

export const assignLocationCostCenter = async (accountId, actorId, pointOfSaleId, costCenterId) =>
    prisma.$transaction(async (tx) => {
        const location = await tx.pointOfSale.findFirst({ where: { id: pointOfSaleId, accountId } });
        if (!location) throw new ApiError(404, "Location not found.", [], "", "cost_center_location_not_found");
        let center = null;
        if (costCenterId) {
            center = await tx.costCenter.findFirst({ where: { id: costCenterId, accountId, isActive: true } });
            if (!center) throw new ApiError(400, "The cost center is invalid, inactive, or belongs to another company.", [], "", "cost_center_assignment_invalid");
        }
        const updated = await tx.pointOfSale.update({ where: { id: pointOfSaleId }, data: { defaultCostCenterId: center?.id || null } });
        await tx.accountingConfigAudit.create({
            data: {
                accountId, actorId, entityType: "point_of_sale_cost_center", entityId: pointOfSaleId, action: "updated",
                before: { cost_center_id: location.defaultCostCenterId }, after: { cost_center_id: center?.id || null },
            },
        });
        return updated;
    });
