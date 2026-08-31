import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const TAX_TYPES = ["income", "vat", "ica"];
const BASE_TYPES = ["subtotal", "vat", "total"];
const round2 = (value) => Number(Number(value).toFixed(2));

const parseDate = (value, field) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new ApiError(400, `${field} no es una fecha válida.`);
    return date;
};

export const calculateWithholdingAmount = (concept, totals) => {
    const subtotal = round2(totals.subtotal || 0);
    const vat = round2(totals.vat || 0);
    const total = round2(totals.total ?? subtotal + vat);
    const bases = { subtotal, vat, total };
    const baseAmount = bases[concept.baseType];
    const minimumBaseAmount = round2(concept.minimumBaseAmount || 0);
    const applies = baseAmount >= minimumBaseAmount && baseAmount > 0;
    return {
        baseAmount,
        minimumBaseAmount,
        applies,
        withheldAmount: applies ? round2((baseAmount * Number(concept.ratePercent)) / 100) : 0,
    };
};

const serialize = (concept) => ({
    id: concept.id,
    code: concept.code,
    name: concept.name,
    tax_type: concept.taxType,
    base_type: concept.baseType,
    rate_percent: Number(concept.ratePercent),
    minimum_base_amount: Number(concept.minimumBaseAmount),
    effective_from: concept.effectiveFrom,
    effective_to: concept.effectiveTo,
    municipality_code: concept.municipalityCode,
    chart_account: concept.chartAccount ? {
        id: concept.chartAccount.id,
        code: concept.chartAccount.code,
        name: concept.chartAccount.name,
    } : null,
    is_active: concept.isActive,
});

export const listWithholdingConcepts = async (accountId, { activeAt } = {}) => {
    const at = activeAt ? parseDate(activeAt, "active_at") : null;
    const concepts = await prisma.withholdingConcept.findMany({
        where: {
            accountId,
            ...(at ? { isActive: true, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] } : {}),
        },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
        orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
    });
    return concepts.map(serialize);
};

export const createWithholdingConcept = async (accountId, payload) => {
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();
    const taxType = payload.tax_type;
    const baseType = payload.base_type;
    const ratePercent = Number(payload.rate_percent);
    const minimumBaseAmount = Number(payload.minimum_base_amount || 0);
    const effectiveFrom = parseDate(payload.effective_from, "effective_from");
    const effectiveTo = payload.effective_to ? parseDate(payload.effective_to, "effective_to") : null;

    if (!code || !name) throw new ApiError(400, "Código y nombre son obligatorios.");
    if (!TAX_TYPES.includes(taxType)) throw new ApiError(400, "Tipo de retención inválido.");
    if (!BASE_TYPES.includes(baseType)) throw new ApiError(400, "Base de retención inválida.");
    if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent > 100) throw new ApiError(400, "La tarifa debe ser mayor que 0 y menor o igual que 100%.");
    if (!Number.isFinite(minimumBaseAmount) || minimumBaseAmount < 0) throw new ApiError(400, "La base mínima no puede ser negativa.");
    if (effectiveTo && effectiveTo < effectiveFrom) throw new ApiError(400, "effective_to no puede ser anterior a effective_from.");
    if (taxType === "ica" && !String(payload.municipality_code || "").trim()) throw new ApiError(400, "El municipio es obligatorio para ReteICA.");

    const chartAccount = await prisma.chartAccount.findFirst({
        where: { id: payload.chart_account_id, createdById: accountId, accountType: "liability", isActive: true },
    });
    if (!chartAccount) throw new ApiError(400, "La cuenta contable debe ser un pasivo activo del mismo tercero contable.");

    // Two effective versions of the same code may not cover the same day;
    // otherwise a purchase would have no deterministic rate to freeze.
    const overlap = await prisma.withholdingConcept.findFirst({
        where: {
            accountId,
            code,
            effectiveFrom: { lte: effectiveTo || new Date("9999-12-31T23:59:59.999Z") },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        select: { id: true },
    });
    if (overlap) throw new ApiError(409, `El concepto ${code} ya tiene una versión vigente en ese intervalo.`);

    const created = await prisma.withholdingConcept.create({
        data: {
            accountId, code, name, taxType, baseType, ratePercent, minimumBaseAmount,
            effectiveFrom, effectiveTo,
            municipalityCode: taxType === "ica" ? String(payload.municipality_code).trim() : null,
            chartAccountId: chartAccount.id,
        },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
    });
    return serialize(created);
};

export const setWithholdingConceptActive = async (accountId, id, isActive) => {
    const concept = await prisma.withholdingConcept.findFirst({ where: { id, accountId } });
    if (!concept) throw new ApiError(404, "Concepto de retención no encontrado.");
    const updated = await prisma.withholdingConcept.update({
        where: { id }, data: { isActive: isActive === true },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
    });
    return serialize(updated);
};

export const previewWithholdings = async (accountId, payload) => {
    const at = parseDate(payload.transaction_date || new Date().toISOString(), "transaction_date");
    const subtotal = Number(payload.subtotal);
    const vat = Number(payload.vat || 0);
    if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(vat) || vat < 0) {
        throw new ApiError(400, "Subtotal e IVA deben ser valores no negativos.");
    }
    const ids = [...new Set(Array.isArray(payload.concept_ids) ? payload.concept_ids : [])];
    if (ids.length === 0) throw new ApiError(400, "Selecciona al menos un concepto de retención.");
    const concepts = await prisma.withholdingConcept.findMany({
        where: { id: { in: ids }, accountId, isActive: true, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
    });
    if (concepts.length !== ids.length) throw new ApiError(400, "Uno o más conceptos no existen o no están vigentes para la fecha indicada.");
    const items = concepts.map((concept) => ({ ...serialize(concept), ...calculateWithholdingAmount(concept, { subtotal, vat }) }));
    const withheldTotal = round2(items.reduce((sum, item) => sum + item.withheldAmount, 0));
    return { subtotal: round2(subtotal), vat: round2(vat), gross_total: round2(subtotal + vat), withheld_total: withheldTotal, payable_total: round2(subtotal + vat - withheldTotal), items };
};
