import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { prisma } from "../db/prisma.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapProduct = (product) => ({
    _id: toExternalId(product),
    product_name: product.productName,
    product_code: product.productCode,
    category_id: product.category
        ? {
              _id: toExternalId(product.category),
              category_name: product.category.categoryName,
          }
        : null,
    unit_id: product.unit
        ? {
              _id: toExternalId(product.unit),
              unit_name: product.unit.unitName,
          }
        : null,
    buying_price: Number(product.buyingPrice),
    selling_price: Number(product.sellingPrice),
    stock: product.stock,
    product_image: product.productImage,
    unit_measure_code: product.unitMeasureCode,
    standard_code: product.standardCode,
    tax_code: product.taxCode,
    tax_rate: product.taxRate === null ? null : Number(product.taxRate),
    is_tax_excluded: product.isTaxExcluded,
    created_by: product.createdBy
        ? {
              _id: toExternalId(product.createdBy),
              username: product.createdBy.username,
          }
        : null,
    updated_by: product.updatedBy
        ? {
              _id: toExternalId(product.updatedBy),
              username: product.updatedBy.username,
          }
        : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
});

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            category: {
                select: { id: true, legacyMongoId: true, categoryName: true },
            },
            unit: {
                select: { id: true, legacyMongoId: true, unitName: true },
            },
            createdBy: {
                select: { id: true, legacyMongoId: true, username: true },
            },
            updatedBy: {
                select: { id: true, legacyMongoId: true, username: true },
            },
        },
    });

const resolveCategoryForUser = async (categoryId, user) => {
    if (!categoryId) return null;

    const category = await prisma.category.findFirst({
        where: {
            OR: [{ id: categoryId }, { legacyMongoId: categoryId }],
        },
        include: {
            createdBy: {
                select: { id: true, role: true },
            },
        },
    });

    if (!category) return null;

    if (user.role === "admin") {
        return category;
    }

    if (
        category.createdById === user.prismaId ||
        category.createdBy?.role === "admin"
    ) {
        return category;
    }

    return null;
};

const resolveUnitForUser = async (unitId, user) => {
    if (!unitId) return null;

    const unit = await prisma.unit.findFirst({
        where: {
            OR: [{ id: unitId }, { legacyMongoId: unitId }],
        },
    });

    if (!unit) return null;

    if (user.role === "admin") {
        return unit;
    }

    if (unit.createdById === user.prismaId) {
        return unit;
    }

    return null;
};

const createProduct = asyncHandler(async (req, res, next) => {
    const {
        product_name,
        product_code,
        category_id,
        unit_id,
        buying_price,
        selling_price,
        unit_measure_code,
        standard_code,
        tax_code,
        tax_rate,
        is_tax_excluded,
    } = req.body;

    if (
        !product_name ||
        !product_code ||
        !category_id ||
        !unit_id ||
        buying_price === undefined ||
        selling_price === undefined
    ) {
        return next(new ApiError(400, "All product details are required"));
    }

    const buyingPrice = Number(buying_price);
    const sellingPrice = Number(selling_price);

    if (Number.isNaN(buyingPrice) || Number.isNaN(sellingPrice)) {
        return next(new ApiError(400, "Buying and selling prices must be valid numbers"));
    }

    if (buyingPrice < 0 || sellingPrice < 0) {
        return next(new ApiError(400, "Prices cannot be negative"));
    }

    if (sellingPrice < buyingPrice) {
        return next(new ApiError(400, "Selling price must be >= buying price"));
    }

    if (String(product_code).trim().length > 5) {
        return next(new ApiError(400, "Product code must be 5 characters or less"));
    }

    try {
        const [category, unit] = await Promise.all([
            resolveCategoryForUser(category_id, req.user),
            resolveUnitForUser(unit_id, req.user),
        ]);

        if (!category) {
            return next(new ApiError(400, "Invalid category selected"));
        }

        if (!unit) {
            return next(new ApiError(400, "Invalid unit selected"));
        }

        let productImageUrl = "default-product.png";
        if (req.file) {
            const image = await uploadToCloudinary(req.file);
            if (image) {
                productImageUrl = image.url;
            }
        }

        const product = await prisma.product.create({
            data: {
                productName: String(product_name).trim(),
                productCode: String(product_code).trim().toUpperCase(),
                categoryId: category.id,
                unitId: unit.id,
                buyingPrice,
                sellingPrice,
                productImage: productImageUrl,
                stock: 0,
                createdById: req.user.prismaId,
                ...(unit_measure_code !== undefined && { unitMeasureCode: String(unit_measure_code).trim() }),
                ...(standard_code !== undefined && { standardCode: String(standard_code).trim() }),
                ...(tax_code !== undefined && { taxCode: String(tax_code).trim() || null }),
                ...(tax_rate !== undefined && { taxRate: Number(tax_rate) }),
                ...(typeof is_tax_excluded === "boolean" && { isTaxExcluded: is_tax_excluded }),
            },
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(201)
            .json(new ApiResponse(201, mapProduct(product), "Product created successfully"));
    } catch (error) {
        if (error.code === "P2002") {
            return next(new ApiError(409, "Product with this code already exists"));
        }
        return next(new ApiError(500, error.message));
    }
});

const getAllProducts = asyncHandler(async (req, res, next) => {
    const { search, category, min_stock, max_stock, sort_by, sort_order } = req.query;

    const where = {};

    if (req.user.role !== "admin") {
        where.createdById = req.user.prismaId;
    }

    if (search) {
        where.OR = [
            { productName: { contains: search, mode: "insensitive" } },
            { productCode: { contains: search, mode: "insensitive" } },
        ];
    }

    if (category) {
        where.category = {
            OR: [{ id: category }, { legacyMongoId: category }],
        };
    }

    const minStock = min_stock !== undefined ? Number(min_stock) : undefined;
    const maxStock = max_stock !== undefined ? Number(max_stock) : undefined;

    if (!Number.isNaN(minStock) || !Number.isNaN(maxStock)) {
        where.stock = {};
        if (!Number.isNaN(minStock)) where.stock.gte = minStock;
        if (!Number.isNaN(maxStock)) where.stock.lte = maxStock;
    }

    const sortFieldMap = {
        product_name: "productName",
        product_code: "productCode",
        buying_price: "buyingPrice",
        selling_price: "sellingPrice",
        stock: "stock",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
    };

    const mappedSortField = sortFieldMap[sort_by] || "createdAt";
    const sortDirection = sort_order === "desc" ? "desc" : "asc";
    const orderBy = sort_by
        ? { [mappedSortField]: sortDirection }
        : { createdAt: "desc" };

    try {
        const products = await prisma.product.findMany({
            where,
            orderBy,
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, products.map(mapProduct), "Products fetched successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const updateProduct = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updateData = req.body;

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to update this product")
            );
        }

        let resolvedCategoryId;
        if (updateData.category_id !== undefined) {
            const category = await resolveCategoryForUser(updateData.category_id, req.user);
            if (!category) {
                return next(new ApiError(400, "Invalid category selected"));
            }
            resolvedCategoryId = category.id;
        }

        let resolvedUnitId;
        if (updateData.unit_id !== undefined) {
            const unit = await resolveUnitForUser(updateData.unit_id, req.user);
            if (!unit) {
                return next(new ApiError(400, "Invalid unit selected"));
            }
            resolvedUnitId = unit.id;
        }

        let productImage = existingProduct.productImage;
        if (req.file) {
            const image = await uploadToCloudinary(req.file);
            if (image) {
                productImage = image.url;
            }
        }

        const payload = {
            ...(updateData.product_name !== undefined && {
                productName: String(updateData.product_name).trim(),
            }),
            ...(updateData.product_code !== undefined && {
                productCode: String(updateData.product_code).trim().toUpperCase(),
            }),
            ...(resolvedCategoryId && { categoryId: resolvedCategoryId }),
            ...(resolvedUnitId && { unitId: resolvedUnitId }),
            ...(updateData.buying_price !== undefined && {
                buyingPrice: Number(updateData.buying_price),
            }),
            ...(updateData.selling_price !== undefined && {
                sellingPrice: Number(updateData.selling_price),
            }),
            ...(updateData.stock !== undefined && {
                stock: Number(updateData.stock),
            }),
            ...(updateData.unit_measure_code !== undefined && {
                unitMeasureCode: String(updateData.unit_measure_code).trim(),
            }),
            ...(updateData.standard_code !== undefined && {
                standardCode: String(updateData.standard_code).trim(),
            }),
            ...(updateData.tax_code !== undefined && {
                taxCode: String(updateData.tax_code).trim() || null,
            }),
            ...(updateData.tax_rate !== undefined && { taxRate: Number(updateData.tax_rate) }),
            ...(typeof updateData.is_tax_excluded === "boolean" && {
                isTaxExcluded: updateData.is_tax_excluded,
            }),
            productImage,
            updatedById: req.user.prismaId,
        };

        if (payload.productCode && payload.productCode.length > 5) {
            return next(new ApiError(400, "Product code must be 5 characters or less"));
        }

        if (
            payload.buyingPrice !== undefined &&
            (Number.isNaN(payload.buyingPrice) || payload.buyingPrice < 0)
        ) {
            return next(new ApiError(400, "Buying price must be a non-negative number"));
        }

        if (
            payload.sellingPrice !== undefined &&
            (Number.isNaN(payload.sellingPrice) || payload.sellingPrice < 0)
        ) {
            return next(new ApiError(400, "Selling price must be a non-negative number"));
        }

        if (payload.stock !== undefined && (Number.isNaN(payload.stock) || payload.stock < 0)) {
            return next(new ApiError(400, "Stock must be a non-negative number"));
        }

        if (payload.taxRate !== undefined && (Number.isNaN(payload.taxRate) || payload.taxRate < 0)) {
            return next(new ApiError(400, "Tax rate must be a non-negative number"));
        }

        const buyingPriceForValidation =
            payload.buyingPrice !== undefined
                ? payload.buyingPrice
                : Number(existingProduct.buyingPrice);
        const sellingPriceForValidation =
            payload.sellingPrice !== undefined
                ? payload.sellingPrice
                : Number(existingProduct.sellingPrice);

        if (sellingPriceForValidation < buyingPriceForValidation) {
            return next(new ApiError(400, "Selling price must be >= buying price"));
        }

        const product = await prisma.product.update({
            where: { id: existingProduct.id },
            data: payload,
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, mapProduct(product), "Product updated successfully"));
    } catch (error) {
        if (error.code === "P2002") {
            return next(new ApiError(409, "Product with this code already exists"));
        }
        return next(new ApiError(500, error.message));
    }
});

const deleteProduct = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to delete this product")
            );
        }

        await prisma.product.delete({ where: { id: existingProduct.id } });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Product deleted successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAllProductsAdmin = asyncHandler(async (_req, res, next) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, products.map(mapProduct), "All products fetched successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

export {
    createProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    getAllProductsAdmin,
};
