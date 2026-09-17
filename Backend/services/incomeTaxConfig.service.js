import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const GROUPS = ["group1", "group2", "group3", "group4"];

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const serializeYearConfig = (config) => ({
    id: config.id,
    year: config.year,
    ordinary_rate_percent: Number(config.ordinaryRatePercent),
    uvt_value: Number(config.uvtValue),
    is_verified: config.isVerified,
    verified_at: config.verifiedAt,
});

const serializeBracket = (bracket) => ({
    id: bracket.id,
    year: bracket.year,
    group: bracket.group,
    min_uvt: Number(bracket.minUvt),
    max_uvt: bracket.maxUvt === null ? null : Number(bracket.maxUvt),
    rate_percent: Number(bracket.ratePercent),
    is_verified: bracket.isVerified,
});

// Platform-wide reference data (see the schema comment on
// IncomeTaxYearConfig) - listing is intentionally not accountId-scoped, any
// authenticated tenant can read the year it needs for its own renta report.
// Writing is gated at the route level to isAdmin (platform admin), not a
// company's "accounting" team permission - see company.routes.js's convention.
export const listIncomeTaxYearConfigs = async () => {
    const configs = await prisma.incomeTaxYearConfig.findMany({ orderBy: { year: "desc" } });
    return configs.map(serializeYearConfig);
};

export const upsertIncomeTaxYearConfig = async (actorId, payload) => {
    const year = Number(payload.year);
    const ordinaryRatePercent = Number(payload.ordinary_rate_percent);
    const uvtValue = Number(payload.uvt_value);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new ApiError(400, "The tax year is invalid.", [], "", "income_tax_year_invalid");
    if (!Number.isFinite(ordinaryRatePercent) || ordinaryRatePercent <= 0 || ordinaryRatePercent > 100) throw new ApiError(400, "The ordinary regime rate must be between 0 and 100%.", [], "", "income_tax_rate_invalid");
    if (!Number.isFinite(uvtValue) || uvtValue <= 0) throw new ApiError(400, "The UVT value must be greater than zero.", [], "", "income_tax_uvt_invalid");

    const config = await prisma.incomeTaxYearConfig.upsert({
        where: { year },
        update: { ordinaryRatePercent, uvtValue },
        create: { year, ordinaryRatePercent, uvtValue, isVerified: false },
    });
    return serializeYearConfig(config);
};

export const setIncomeTaxYearConfigVerified = async (actorId, year, isVerified) => {
    const config = await prisma.incomeTaxYearConfig.findUnique({ where: { year: Number(year) } });
    if (!config) throw new ApiError(404, "No tax configuration exists for that year yet.", [], "", "income_tax_year_not_found");
    const updated = await prisma.incomeTaxYearConfig.update({
        where: { year: Number(year) },
        data: isVerified
            ? { isVerified: true, verifiedAt: new Date(), verifiedByUserId: actorId }
            : { isVerified: false, verifiedAt: null, verifiedByUserId: null },
    });
    return serializeYearConfig(updated);
};

export const listSimpleRegimeBrackets = async (year) => {
    const brackets = await prisma.simpleRegimeBracket.findMany({
        where: year ? { year: Number(year) } : undefined,
        orderBy: [{ year: "desc" }, { group: "asc" }, { minUvt: "asc" }],
    });
    return brackets.map(serializeBracket);
};

export const upsertSimpleRegimeBrackets = async (actorId, year, brackets) => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw new ApiError(400, "The tax year is invalid.", [], "", "income_tax_year_invalid");
    if (!Array.isArray(brackets) || brackets.length === 0) throw new ApiError(400, "At least one bracket is required.", [], "", "simple_regime_brackets_required");

    const parsed = brackets.map((bracket) => {
        const group = bracket.group;
        const minUvt = Number(bracket.min_uvt);
        const maxUvt = bracket.max_uvt === null || bracket.max_uvt === undefined || bracket.max_uvt === "" ? null : Number(bracket.max_uvt);
        const ratePercent = Number(bracket.rate_percent);
        if (!GROUPS.includes(group)) throw new ApiError(400, "One of the brackets has an invalid activity group.", [], "", "simple_regime_group_invalid");
        if (!Number.isFinite(minUvt) || minUvt < 0) throw new ApiError(400, "A bracket's minimum UVT is invalid.", [], "", "simple_regime_bracket_invalid");
        if (maxUvt !== null && (!Number.isFinite(maxUvt) || maxUvt <= minUvt)) throw new ApiError(400, "A bracket's maximum UVT must be greater than its minimum.", [], "", "simple_regime_bracket_invalid");
        if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent > 100) throw new ApiError(400, "A bracket's rate must be between 0 and 100%.", [], "", "simple_regime_bracket_invalid");
        return { group, minUvt: round2(minUvt), maxUvt: maxUvt === null ? null : round2(maxUvt), ratePercent: round2(ratePercent) };
    });

    await prisma.$transaction(
        parsed.map((bracket) =>
            prisma.simpleRegimeBracket.upsert({
                where: { year_group_minUvt: { year: numericYear, group: bracket.group, minUvt: bracket.minUvt } },
                update: { maxUvt: bracket.maxUvt, ratePercent: bracket.ratePercent, isVerified: false },
                create: { year: numericYear, ...bracket, isVerified: false },
            })
        )
    );
    return listSimpleRegimeBrackets(numericYear);
};

export const setSimpleRegimeBracketsVerified = async (actorId, year, isVerified) => {
    const numericYear = Number(year);
    await prisma.simpleRegimeBracket.updateMany({ where: { year: numericYear }, data: { isVerified: Boolean(isVerified) } });
    return listSimpleRegimeBrackets(numericYear);
};

// Reads only - rentaDeclaration.service.js's own internal lookups, not
// exposed as controller endpoints directly.
export const getIncomeTaxYearConfig = async (year) => {
    const config = await prisma.incomeTaxYearConfig.findUnique({ where: { year: Number(year) } });
    return config ? serializeYearConfig(config) : null;
};

export const getSimpleRegimeBracketsForGroup = async (year, group) => {
    const brackets = await prisma.simpleRegimeBracket.findMany({
        where: { year: Number(year), group },
        orderBy: { minUvt: "asc" },
    });
    return brackets.map(serializeBracket);
};
