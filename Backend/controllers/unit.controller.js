import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapUnit = (unit) => ({
    _id: toExternalId(unit),
    unit_name: unit.unitName,
    created_by: {
        _id: toExternalId(unit.createdBy),
        username: unit.createdBy.username,
    },
    updated_by: unit.updatedBy
        ? {
              _id: toExternalId(unit.updatedBy),
              username: unit.updatedBy.username,
          }
        : null,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
});

const findUnitByAnyId = async (id) =>
    prisma.unit.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            createdBy: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    username: true,
                },
            },
            updatedBy: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    username: true,
                },
            },
        },
    });

const createUnit = asyncHandler(async (req, res, next) => {
    const { unit_name, is_tutorial_data } = req.body;

    if (!unit_name?.trim()) {
        return next(new ApiError(400, "Unit name is required"));
    }

    try {
        const existingUnit = await prisma.unit.findFirst({
            where: {
                unitName: unit_name.trim(),
                createdById: req.user.prismaId,
            },
            select: { id: true },
        });

        if (existingUnit) {
            return next(new ApiError(409, "Unit already exists"));
        }

        const created = await prisma.unit.create({
            data: {
                unitName: unit_name.trim(),
                isTutorialData: is_tutorial_data === true,
                createdById: req.user.prismaId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
                updatedBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
            },
        });

        return res
            .status(201)
            .json(new ApiResponse(201, mapUnit(created), "Unit created successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAvailableUnits = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;

        const units = await prisma.unit.findMany({
            where: {
                OR: [{ createdById: userId }, { createdBy: { role: "admin" } }],
            },
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
                updatedBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
            },
        });

        const deduped = [];
        const seen = new Set();

        for (const unit of units) {
            const externalId = toExternalId(unit);
            if (!seen.has(externalId)) {
                seen.add(externalId);
                deduped.push(mapUnit(unit));
            }
        }

        return res
            .status(200)
            .json(new ApiResponse(200, deduped, "Available units fetched successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAllUnits = asyncHandler(async (req, res, next) => {
    try {
        const where =
            req.user.role === "admin" ? {} : { createdById: req.user.prismaId };

        const units = await prisma.unit.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
                updatedBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, units.map(mapUnit), "Units fetched successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const updateUnit = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { unit_name } = req.body;

    if (!unit_name?.trim()) {
        return next(new ApiError(400, "Unit name is required"));
    }

    try {
        const unit = await findUnitByAnyId(id);

        if (!unit) {
            return next(new ApiError(404, "Unit not found"));
        }

        if (req.user.role !== "admin" && unit.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You don't have permission to update this unit")
            );
        }

        const updated = await prisma.unit.update({
            where: { id: unit.id },
            data: {
                unitName: unit_name.trim(),
                updatedById: req.user.prismaId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
                updatedBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                    },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, mapUnit(updated), "Unit updated successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const deleteUnit = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const unit = await findUnitByAnyId(id);

        if (!unit) {
            return next(new ApiError(404, "Unit not found"));
        }

        if (req.user.role !== "admin" && unit.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You don't have permission to delete this unit")
            );
        }

        await prisma.unit.delete({ where: { id: unit.id } });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Unit deleted successfully"));
    } catch (error) {
        if (error.code === "P2003") {
            return next(
                new ApiError(
                    409,
                    "This unit can't be deleted because it still has products assigned to it. Reassign or delete those products first."
                )
            );
        }
        return next(new ApiError(500, error.message));
    }
});

export { createUnit, getAllUnits, getAvailableUnits, updateUnit, deleteUnit };
