import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listCompaniesAdmin = asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
        select: {
            id: true,
            name: true,
            legalName: true,
            contactEmail: true,
            phone: true,
            isActive: true,
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
    const { name, legalName, contactEmail, phone } = req.body;

    if (!name?.trim()) {
        return next(new ApiError(400, "Company name is required"));
    }

    const normalizedName = name.trim();
    const normalizedContactEmail = contactEmail?.trim().toLowerCase() || null;

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
            contactEmail: normalizedContactEmail,
            phone: phone?.trim() || null,
            isActive: true,
        },
        select: {
            id: true,
            name: true,
            legalName: true,
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
    const { name, legalName, contactEmail, phone, isActive } = req.body;

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
            ...(contactEmail !== undefined
                ? { contactEmail: contactEmail?.trim().toLowerCase() || null }
                : {}),
            ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
            ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        select: {
            id: true,
            name: true,
            legalName: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, company, "Company updated successfully"));
});
