import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { prisma } from "../db/prisma.js";
import { normalizeCountryCode } from "../services/companyCountry.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { recordStockMovement } from "../services/stockMovement.service.js";
import { isForeignKeyRestrictError } from "../utils/prismaErrors.js";
import { getColombiaTaxSettings } from "../utils/systemSettings.js";
import { emitAccountEvent } from "../live/dataEvents.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const TAX_TREATMENTS = ["taxed", "excluded", "exempt"];

// Product.taxRate defaults to 0 at the schema level so it stays neutral for
// companies outside Colombia. When a CO company creates a product without an
// explicit tax rate, default it to the DIAN general VAT rate here instead -
// silently leaving it at 0 would understate IVA on every electronic invoice.
// The rate itself comes from SystemSetting (admin-editable), not a hardcoded
// constant, since it only ever changes by government decree (ET art. 468).
const resolveDefaultTaxRate = async (userId, explicitTaxRate) => {
    if (explicitTaxRate !== undefined) {
        return Number(explicitTaxRate);
    }

    const creator = await prisma.user.findUnique({
        where: { id: userId },
        select: { company: { select: { countryCode: true } } },
    });

    if (normalizeCountryCode(creator?.company?.countryCode) !== "CO") {
        return undefined;
    }

    const { vatRate } = await getColombiaTaxSettings();
    return vatRate;
};

// configurableAlerts is an Escala+ feature - silently drop the field for
// lower plans instead of hard-failing the whole product save, so a
// downgraded account doesn't suddenly get 400s on an otherwise valid form.
const resolveLowStockThreshold = async (userId, role, rawValue) => {
    if (rawValue === undefined) return undefined;
    if (role === "admin") {
        return rawValue === null || rawValue === "" ? null : Number(rawValue);
    }

    const subscription = await ensureUserSubscription(userId);
    const canConfigure = getPlanFeatures(getEffectivePlan(subscription)).configurableAlerts;
    if (!canConfigure) return undefined;

    return rawValue === null || rawValue === "" ? null : Number(rawValue);
};

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
    tax_treatment: product.taxTreatment,
    low_stock_threshold: product.lowStockThreshold,
    is_tutorial_data: product.isTutorialData,
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

    if (user.role === "admin" || category.createdById === user.prismaId) {
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
        include: {
            createdBy: {
                select: { id: true, role: true },
            },
        },
    });

    if (!unit) return null;

    if (user.role === "admin" || unit.createdById === user.prismaId) {
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
        tax_treatment,
        low_stock_threshold,
        is_tutorial_data,
    } = req.body;

    if (tax_treatment !== undefined && !TAX_TREATMENTS.includes(tax_treatment)) {
        return next(new ApiError(400, `tax_treatment must be one of: ${TAX_TREATMENTS.join(", ")}`));
    }

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

    if (buyingPrice <= 0 || sellingPrice <= 0) {
        return next(new ApiError(400, "Prices must be greater than 0"));
    }

    if (sellingPrice < buyingPrice) {
        return next(new ApiError(400, "Selling price must be >= buying price"));
    }

    if (String(product_code).trim().length > 40) {
        return next(new ApiError(400, "Product code must be 40 characters or less"));
    }

    if (String(product_name).trim().length > 50) {
        return next(new ApiError(400, "Product name must be 50 characters or less"));
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
            const image = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "products",
            });
            if (image) {
                productImageUrl = image.url;
            }
        }

        const resolvedTaxRate = await resolveDefaultTaxRate(req.user.prismaId, tax_rate !== undefined ? tax_rate : undefined);
        const resolvedLowStockThreshold = await resolveLowStockThreshold(req.user.prismaId, req.user.role, low_stock_threshold);

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
                isTutorialData: is_tutorial_data === true || is_tutorial_data === "true",
                createdById: req.user.prismaId,
                ...(unit_measure_code !== undefined && { unitMeasureCode: String(unit_measure_code).trim() }),
                ...(standard_code !== undefined && { standardCode: String(standard_code).trim() }),
                ...(tax_code !== undefined && { taxCode: String(tax_code).trim() || null }),
                ...(resolvedTaxRate !== undefined && { taxRate: resolvedTaxRate }),
                ...(tax_treatment !== undefined && { taxTreatment: tax_treatment }),
                ...(resolvedLowStockThreshold !== undefined && { lowStockThreshold: resolvedLowStockThreshold }),
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

        emitAccountEvent(req.user.prismaId, "product", "created");
        return res
            .status(201)
            .json(new ApiResponse(201, mapProduct(product), "Product created successfully"));
    } catch (error) {
        if (error.code === "P2002") {
            return next(new ApiError(409, "Product with this code already exists"));
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updateProduct = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updateData = req.body;

    if (
        updateData.tax_treatment !== undefined &&
        !TAX_TREATMENTS.includes(updateData.tax_treatment)
    ) {
        return next(new ApiError(400, `tax_treatment must be one of: ${TAX_TREATMENTS.join(", ")}`));
    }

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
            const image = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "products",
            });
            if (image) {
                productImage = image.url;
            }
        }

        const resolvedLowStockThreshold = await resolveLowStockThreshold(
            req.user.prismaId,
            req.user.role,
            updateData.low_stock_threshold
        );

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
            // stock is intentionally NOT accepted here - it used to be a free
            // field on this same general-purpose edit endpoint, which let it
            // be overwritten with no reason, no audit trail, and no
            // stock_movements row. Use POST /products/:id/adjust-stock
            // instead, which requires a reason and records the movement.
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
            ...(updateData.tax_treatment !== undefined && { taxTreatment: updateData.tax_treatment }),
            ...(resolvedLowStockThreshold !== undefined && { lowStockThreshold: resolvedLowStockThreshold }),
            productImage,
            updatedById: req.user.prismaId,
        };

        if (payload.productCode && payload.productCode.length > 40) {
            return next(new ApiError(400, "Product code must be 40 characters or less"));
        }

        if (payload.productName && payload.productName.length > 50) {
            return next(new ApiError(400, "Product name must be 50 characters or less"));
        }

        if (
            payload.buyingPrice !== undefined &&
            (Number.isNaN(payload.buyingPrice) || payload.buyingPrice <= 0)
        ) {
            return next(new ApiError(400, "Buying price must be greater than 0"));
        }

        if (
            payload.sellingPrice !== undefined &&
            (Number.isNaN(payload.sellingPrice) || payload.sellingPrice <= 0)
        ) {
            return next(new ApiError(400, "Selling price must be greater than 0"));
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

        // Fire-and-forget: the old image is only orphaned once the DB row
        // safely points at the new one, and deleteFile() already swallows
        // its own errors, so this can't turn a successful update into a
        // failed response.
        if (req.file && productImage !== existingProduct.productImage) {
            deleteFile(existingProduct.productImage);
        }

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        return res
            .status(200)
            .json(new ApiResponse(200, mapProduct(product), "Product updated successfully"));
    } catch (error) {
        if (error.code === "P2002") {
            return next(new ApiError(409, "Product with this code already exists"));
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
        deleteFile(existingProduct.productImage);

        emitAccountEvent(existingProduct.createdById, "product", "deleted");
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Product deleted successfully"));
    } catch (error) {
        if (isForeignKeyRestrictError(error)) {
            return next(
                new ApiError(
                    409,
                    "This product can't be deleted because it has purchases, sales, or stock movements on record. Remove or reassign that history first.",
                    [],
                    "",
                    "product_has_history"
                )
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Sets the same low-stock threshold on many products in one request - the
// per-product field (Escala+, see resolveLowStockThreshold above) used to
// only be reachable one product at a time through ProductModal, which made
// re-tuning thresholds across a whole category a real chore. Unlike that
// helper, this endpoint's whole purpose IS setting the threshold, so an
// account without the feature gets an explicit 403 instead of resolveLowStockThreshold's
// silent no-op (which exists for the general product save, where the field
// is just one of many that may or may not be present).
const bulkUpdateLowStockThreshold = asyncHandler(async (req, res, next) => {
    const { productIds, threshold } = req.body || {};

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return next(new ApiError(400, "productIds must be a non-empty array"));
    }
    if (productIds.length > 500) {
        return next(new ApiError(400, "You can update at most 500 products at once"));
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const canConfigure =
        req.user.role === "admin" || getPlanFeatures(getEffectivePlan(subscription)).configurableAlerts;
    if (!canConfigure) {
        return next(
            new ApiError(403, "Los umbrales personalizados por producto están disponibles desde el plan Escala.")
        );
    }

    const value = threshold === null || threshold === "" ? null : Number(threshold);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return next(new ApiError(400, "threshold must be a non-negative number, or null to clear it"));
    }

    // Same dual id lookup as findProductByAnyId (ids may be Prisma cuids or
    // legacy Mongo ids), scoped to this account's own catalog unless admin -
    // matches updateProduct/deleteProduct's ownership rule above.
    const result = await prisma.product.updateMany({
        where: {
            AND: [
                { OR: [{ id: { in: productIds } }, { legacyMongoId: { in: productIds } }] },
                ...(req.user.role === "admin" ? [] : [{ createdById: req.user.prismaId }]),
            ],
        },
        data: { lowStockThreshold: value, updatedById: req.user.prismaId },
    });

    if (result.count > 0) emitAccountEvent(req.user.prismaId, "product", "updated");
    return res
        .status(200)
        .json(new ApiResponse(200, { updatedCount: result.count }, "Umbrales actualizados correctamente"));
});

// Explicit, audited stock correction - the only way to change Product.stock
// outside of a purchase/sale/return, requiring a reason and always writing a
// stock_movements row (sourceType: "adjustment"). Replaces the old free
// `stock` field on the general product edit endpoint above.
const adjustProductStock = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { delta, reason } = req.body;

    const parsedDelta = Number(delta);

    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
        return next(new ApiError(400, "Delta must be a non-zero integer"));
    }

    if (!reason || !String(reason).trim()) {
        return next(new ApiError(400, "A reason is required to adjust stock"));
    }

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
                new ApiError(403, "You don't have permission to adjust this product's stock")
            );
        }

        const requiredStock = parsedDelta < 0 ? -parsedDelta : 0;

        const result = await prisma.$transaction(async (tx) => {
            const claim = await tx.product.updateMany({
                where: { id: existingProduct.id, stock: { gte: requiredStock } },
                data: { stock: { increment: parsedDelta }, updatedById: req.user.prismaId },
            });

            if (claim.count === 0) {
                throw new ApiError(
                    409,
                    "Not enough stock to apply this adjustment"
                );
            }

            const updated = await tx.product.findUniqueOrThrow({
                where: { id: existingProduct.id },
                include: {
                    category: { select: { id: true, legacyMongoId: true, categoryName: true } },
                    unit: { select: { id: true, legacyMongoId: true, unitName: true } },
                    createdBy: { select: { id: true, legacyMongoId: true, username: true } },
                    updatedBy: { select: { id: true, legacyMongoId: true, username: true } },
                },
            });

            await recordStockMovement(tx, {
                productId: existingProduct.id,
                accountId: existingProduct.createdById,
                delta: parsedDelta,
                balanceAfter: updated.stock,
                sourceType: "adjustment",
                sourceId: null,
                reason: String(reason).trim(),
                createdById: req.user.prismaId,
            });

            return updated;
        });

        emitAccountEvent(existingProduct.createdById, "product", "stock-changed");
        return res
            .status(200)
            .json(new ApiResponse(200, mapProduct(result), "Stock adjusted successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Read-only ledger for a single product - the movement history the audit
// found nowhere for the user to actually see (StockMovement is the only
// table that records it). Tenant-scoped the same way every other product
// read is: non-admins only ever see their own account's product.
const getProductStockMovements = asyncHandler(async (req, res, next) => {
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
                new ApiError(403, "You don't have permission to view this product's history")
            );
        }

        const movements = await prisma.stockMovement.findMany({
            where: { productId: existingProduct.id },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                createdBy: { select: { id: true, legacyMongoId: true, username: true } },
            },
        });

        const mapped = movements.map((m) => ({
            _id: m.id,
            delta: m.delta,
            balance_after: m.balanceAfter,
            source_type: m.sourceType,
            source_id: m.sourceId,
            reason: m.reason,
            created_by: m.createdBy
                ? { _id: m.createdBy.legacyMongoId || m.createdBy.id, username: m.createdBy.username }
                : null,
            createdAt: m.createdAt,
        }));

        return res
            .status(200)
            .json(new ApiResponse(200, mapped, "Stock movements fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    createProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    bulkUpdateLowStockThreshold,
    getAllProductsAdmin,
    adjustProductStock,
    getProductStockMovements,
};
