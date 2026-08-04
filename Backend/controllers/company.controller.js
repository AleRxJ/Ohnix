import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Deliberately distinct from companyCountry.service.js#normalizeCountryCode:
// that one just normalizes an already-stored value for fiscal checks, while
// this one validates the ISO-2 *format* of user-submitted input and rejects
// anything malformed.
const parseIsoCountryCode = (value) => {
    const normalized = `${value || ""}`.trim().toUpperCase();
    if (!normalized) {
        return null;
    }

    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

const companyFiscalSelect = {
    electronicInvoicingEnabled: true,
    factusNumberingRangeId: true,
    factusDocumentType: true,
    factusOperationType: true,
    factusPaymentForm: true,
    factusPaymentMethodCode: true,
};

const normalizeFactusConfig = (body) => {
    const config = {};
    if (body.factusNumberingRangeId !== undefined) {
        config.factusNumberingRangeId = `${body.factusNumberingRangeId || ""}`.trim() || null;
    }
    for (const [input, field] of [
        ["factusDocumentType", "factusDocumentType"],
        ["factusOperationType", "factusOperationType"],
        ["factusPaymentForm", "factusPaymentForm"],
        ["factusPaymentMethodCode", "factusPaymentMethodCode"],
    ]) {
        if (body[input] !== undefined && `${body[input]}`.trim()) {
            config[field] = `${body[input]}`.trim();
        }
    }
    if (typeof body.electronicInvoicingEnabled === "boolean") {
        config.electronicInvoicingEnabled = body.electronicInvoicingEnabled;
    }
    return config;
};

export const listCompaniesAdmin = asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            ...companyFiscalSelect,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, companies, "Companies fetched successfully"));
});

export const createCompanyAdmin = asyncHandler(async (req, res, next) => {
    const { name, legalName, countryCode, contactEmail, phone } = req.body;

    if (!name?.trim()) {
        return next(new ApiError(400, "Company name is required"));
    }

    const normalizedName = name.trim();
    const normalizedCountryCode = parseIsoCountryCode(countryCode);
    const normalizedContactEmail = contactEmail?.trim().toLowerCase() || null;
    const hasExplicitCountry =
        countryCode !== undefined && `${countryCode || ""}`.trim() !== "";

    if (hasExplicitCountry && !normalizedCountryCode) {
        return next(new ApiError(400, "countryCode must be a valid ISO-2 code (e.g. CO, ES)"));
    }

    const existed = await prisma.company.findFirst({
        where: {
            name: {
                equals: normalizedName,
                mode: "insensitive",
            },
        },
        select: { id: true },
    });

    if (existed) {
        return next(new ApiError(409, "Company already exists"));
    }

    const company = await prisma.company.create({
        data: {
            name: normalizedName,
            legalName: legalName?.trim() || null,
            countryCode: normalizedCountryCode,
            contactEmail: normalizedContactEmail,
            phone: phone?.trim() || null,
            ...normalizeFactusConfig(req.body),
            isActive: true,
        },
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return res
        .status(201)
        .json(new ApiResponse(201, company, "Company created successfully"));
});

export const updateCompanyAdmin = asyncHandler(async (req, res, next) => {
    const { companyId } = req.params;
    const { name, legalName, countryCode, contactEmail, phone, isActive } = req.body;

    const normalizedCountryCode = parseIsoCountryCode(countryCode);
    const hasExplicitCountry =
        countryCode !== undefined && `${countryCode || ""}`.trim() !== "";

    if (hasExplicitCountry && !normalizedCountryCode) {
        return next(new ApiError(400, "countryCode must be a valid ISO-2 code (e.g. CO, ES)"));
    }

    const existing = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
    });

    if (!existing) {
        return next(new ApiError(404, "Company not found"));
    }

    if (name?.trim()) {
        const collision = await prisma.company.findFirst({
            where: {
                id: { not: companyId },
                name: {
                    equals: name.trim(),
                    mode: "insensitive",
                },
            },
            select: { id: true },
        });

        if (collision) {
            return next(new ApiError(409, "Another company already uses that name"));
        }
    }

    const company = await prisma.company.update({
        where: { id: companyId },
        data: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(legalName !== undefined ? { legalName: legalName?.trim() || null } : {}),
            ...(countryCode !== undefined
                ? { countryCode: hasExplicitCountry ? normalizedCountryCode : null }
                : {}),
            ...(contactEmail !== undefined
                ? { contactEmail: contactEmail?.trim().toLowerCase() || null }
                : {}),
            ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
            ...(typeof isActive === "boolean" ? { isActive } : {}),
            ...normalizeFactusConfig(req.body),
        },
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            ...companyFiscalSelect,
            createdAt: true,
            updatedAt: true,
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, company, "Company updated successfully"));
});
