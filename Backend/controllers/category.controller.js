import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapCategory = (category) => ({
    _id: toExternalId(category),
    category_name: category.categoryName,
    created_by: {
        _id: toExternalId(category.createdBy),
        username: category.createdBy.username,
    },
    updated_by: category.updatedBy
        ? {
              _id: toExternalId(category.updatedBy),
              username: category.updatedBy.username,
          }
        : null,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
});

const findCategoryByAnyId = async (id) =>
    prisma.category.findFirst({
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

const createCategory = asyncHandler(async (req, res, next) => {
    const { category_name, is_tutorial_data } = req.body;

    if (!category_name?.trim()) {
        return next(new ApiError(400, "Category name is required"));
    }

    const creatorId = req.user.prismaId;

    try {
        const existingCategory = await prisma.category.findFirst({
            where: {
                categoryName: category_name.trim(),
                createdById: creatorId,
            },
            select: { id: true },
        });

        if (existingCategory) {
            return next(new ApiError(409, "Category already exists"));
        }

        const created = await prisma.category.create({
            data: {
                categoryName: category_name.trim(),
                isTutorialData: is_tutorial_data === true,
                createdById: creatorId,
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
            .json(
                new ApiResponse(
                    201,
                    mapCategory(created),
                    "Category created successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAllCategories = asyncHandler(async (_req, res, next) => {
    try {
        const categories = await prisma.category.findMany({
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
            .json(
                new ApiResponse(
                    200,
                    categories.map(mapCategory),
                    "All categories fetched successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getUserCategories = asyncHandler(async (req, res, next) => {
    try {
        const categories = await prisma.category.findMany({
            where: { createdById: req.user.prismaId },
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
            .json(
                new ApiResponse(
                    200,
                    categories.map(mapCategory),
                    "User categories fetched successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAvailableCategories = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;

        const categories = await prisma.category.findMany({
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

        for (const category of categories) {
            const externalId = toExternalId(category);
            if (!seen.has(externalId)) {
                seen.add(externalId);
                deduped.push(mapCategory(category));
            }
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    deduped,
                    "Available categories fetched successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const updateCategory = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { category_name } = req.body;

    if (!category_name?.trim()) {
        return next(new ApiError(400, "Category name is required"));
    }

    try {
        const category = await findCategoryByAnyId(id);

        if (!category) {
            return next(new ApiError(404, "Category not found"));
        }

        if (
            req.user.role !== "admin" &&
            category.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(
                    403,
                    "You don't have permission to update this category"
                )
            );
        }

        const updated = await prisma.category.update({
            where: { id: category.id },
            data: {
                categoryName: category_name.trim(),
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
            .json(
                new ApiResponse(
                    200,
                    mapCategory(updated),
                    "Category updated successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const deleteCategory = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const category = await findCategoryByAnyId(id);

        if (!category) {
            return next(new ApiError(404, "Category not found"));
        }

        if (
            req.user.role !== "admin" &&
            category.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(
                    403,
                    "You don't have permission to delete this category"
                )
            );
        }

        await prisma.category.delete({ where: { id: category.id } });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Category deleted successfully"));
    } catch (error) {
        if (error.code === "P2003") {
            return next(
                new ApiError(
                    409,
                    "This category can't be deleted because it still has products assigned to it. Reassign or delete those products first."
                )
            );
        }
        return next(new ApiError(500, error.message));
    }
});

export {
    createCategory,
    getAllCategories,
    getUserCategories,
    getAvailableCategories,
    updateCategory,
    deleteCategory,
};
