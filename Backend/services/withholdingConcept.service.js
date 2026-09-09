import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const TAX_TYPES = ["income", "vat", "ica"];
const BASE_TYPES = ["subtotal", "vat", "total"];
const round2 = (value) => Number(Number(value).toFixed(2));

const parseDate = (value, field) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new ApiError(400, `${field} is not a valid date.`, [{ field }], "", "withholding_date_invalid");
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

export const calculateRetentionReturn = (retention, returnedBaseNow) => {
    const baseAmount = round2(retention.baseAmount);
    const withheldAmount = round2(retention.withheldAmount);
    const returnedBaseAmount = round2(retention.returnedBaseAmount || 0);
    const returnedWithheldAmount = round2(retention.returnedWithheldAmount || 0);
    const baseNow = Math.min(round2(Math.max(Number(returnedBaseNow) || 0, 0)), round2(baseAmount - returnedBaseAmount));
    const newReturnedBase = round2(returnedBaseAmount + baseNow);
    const cumulativeTarget = baseAmount > 0
        ? (newReturnedBase >= baseAmount ? withheldAmount : round2((withheldAmount * newReturnedBase) / baseAmount))
        : 0;
    return {
        baseNow,
        withheldNow: Math.min(round2(Math.max(cumulativeTarget - returnedWithheldAmount, 0)), round2(withheldAmount - returnedWithheldAmount)),
    };
};

export const buildPurchaseRetentionSnapshots = async (db, { accountId, conceptIds, transactionDate, totals }) => {
    const ids = [...new Set(Array.isArray(conceptIds) ? conceptIds.filter(Boolean) : [])];
    if (ids.length === 0) return [];
    const concepts = await db.withholdingConcept.findMany({
        where: {
            id: { in: ids }, accountId, isActive: true,
            effectiveFrom: { lte: transactionDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: transactionDate } }],
        },
    });
    if (concepts.length !== ids.length) throw new ApiError(400, "One or more withholding concepts are unavailable for the purchase date.", [], "", "withholding_concepts_unavailable");
    if (new Set(concepts.map((concept) => concept.code)).size !== concepts.length) {
        throw new ApiError(400, "Two versions of the same withholding concept cannot be applied.", [], "", "withholding_concept_versions_duplicate");
    }
    return concepts.map((concept) => {
        const calculation = calculateWithholdingAmount(concept, totals);
        return {
            conceptId: concept.id,
            conceptCode: concept.code,
            conceptName: concept.name,
            taxType: concept.taxType,
            baseType: concept.baseType,
            ratePercent: concept.ratePercent,
            minimumBaseAmount: concept.minimumBaseAmount,
            baseAmount: calculation.baseAmount,
            withheldAmount: calculation.withheldAmount,
            municipalityCode: concept.municipalityCode,
            chartAccountId: concept.chartAccountId,
        };
    });
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

    if (!code || !name) throw new ApiError(400, "Withholding code and name are required.", [], "", "withholding_fields_required");
    if (!TAX_TYPES.includes(taxType)) throw new ApiError(400, "The withholding tax type is invalid.", [], "", "withholding_tax_type_invalid");
    if (!BASE_TYPES.includes(baseType)) throw new ApiError(400, "The withholding base type is invalid.", [], "", "withholding_base_type_invalid");
    if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent > 100) throw new ApiError(400, "The withholding rate must be greater than zero and at most 100%.", [], "", "withholding_rate_invalid");
    if (!Number.isFinite(minimumBaseAmount) || minimumBaseAmount < 0) throw new ApiError(400, "The minimum withholding base cannot be negative.", [], "", "withholding_minimum_base_invalid");
    if (effectiveTo && effectiveTo < effectiveFrom) throw new ApiError(400, "The end date cannot precede the start date.", [], "", "withholding_date_range_invalid");
    if (taxType === "ica" && !String(payload.municipality_code || "").trim()) throw new ApiError(400, "A municipality is required for ICA withholding.", [], "", "withholding_municipality_required");

    const chartAccount = await prisma.chartAccount.findFirst({
        where: { id: payload.chart_account_id, createdById: accountId, accountType: "liability", isActive: true },
    });
    if (!chartAccount) throw new ApiError(400, "The chart account must be an active liability owned by the company.", [], "", "withholding_chart_account_invalid");

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
    if (overlap) throw new ApiError(409, `Withholding concept ${code} already has an effective version in that date range.`, [], "", "withholding_effective_range_overlap");

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
    if (!concept) throw new ApiError(404, "Withholding concept not found.", [], "", "withholding_concept_not_found");
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
        throw new ApiError(400, "Subtotal and VAT must be non-negative values.", [], "", "withholding_preview_amounts_invalid");
    }
    const ids = [...new Set(Array.isArray(payload.concept_ids) ? payload.concept_ids : [])];
    if (ids.length === 0) throw new ApiError(400, "Select at least one withholding concept.", [], "", "withholding_concept_required");
    const concepts = await prisma.withholdingConcept.findMany({
        where: { id: { in: ids }, accountId, isActive: true, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
        include: { chartAccount: { select: { id: true, code: true, name: true } } },
    });
    if (concepts.length !== ids.length) throw new ApiError(400, "One or more withholding concepts are unavailable for the selected date.", [], "", "withholding_concepts_unavailable");
    const items = concepts.map((concept) => ({ ...serialize(concept), ...calculateWithholdingAmount(concept, { subtotal, vat }) }));
    const withheldTotal = round2(items.reduce((sum, item) => sum + item.withheldAmount, 0));
    return { subtotal: round2(subtotal), vat: round2(vat), gross_total: round2(subtotal + vat), withheld_total: withheldTotal, payable_total: round2(subtotal + vat - withheldTotal), items };
};
