import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";

// Sanity ceiling, not a real catalog limit - matches the spirit of
// MAX_PRODUCT_IMAGES (services/productImage.service.js).
export const MAX_VARIANTS_PER_PRODUCT = 100;

// Builds the human-readable label from an options map in insertion order -
// {"Color":"Negra","Talla":"M"} -> "Negra / M". Values only (not "Color:
// Negra"), matching the "Negra / M" style from the integration design doc.
export const buildOptionsLabel = (options) =>
    Object.values(options || {})
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(" / ");

export const validateOptions = (options) => {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new ApiError(
            400,
            'options must be an object of option name -> value, e.g. {"Color":"Negra","Talla":"M"}'
        );
    }
    const entries = Object.entries(options);
    if (entries.length === 0) {
        throw new ApiError(400, "options must have at least one entry");
    }
    for (const [key, value] of entries) {
        if (!key.trim() || value === undefined || value === null || !String(value).trim()) {
            throw new ApiError(400, "Every option must have a non-empty name and value");
        }
    }
    return options;
};

export const mapVariant = (variant) => ({
    _id: variant.id,
    product_id: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    options_label: variant.optionsLabel,
    options: variant.options,
    selling_price: variant.sellingPrice === null ? null : Number(variant.sellingPrice),
    buying_price: variant.buyingPrice === null ? null : Number(variant.buyingPrice),
    weight_value: variant.weightValue === null ? null : Number(variant.weightValue),
    stock: variant.stock,
    status: variant.status,
    position: variant.position,
    images: (variant.images || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((img) => ({ _id: img.id, url: img.url, position: img.position, is_primary: img.isPrimary })),
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
});

const includeImages = { images: { orderBy: { position: "asc" } } };

export const listVariants = (productId) =>
    prisma.productVariant.findMany({
        where: { productId },
        orderBy: { position: "asc" },
        include: includeImages,
    });

export const findVariantById = (id) =>
    prisma.productVariant.findUnique({ where: { id }, include: includeImages });

export const createVariant = async (productId, accountId, body) => {
    const options = validateOptions(body.options);
    const count = await prisma.productVariant.count({ where: { productId } });
    if (count >= MAX_VARIANTS_PER_PRODUCT) {
        throw new ApiError(400, `A product can have at most ${MAX_VARIANTS_PER_PRODUCT} variants`);
    }

    try {
        const variant = await prisma.productVariant.create({
            data: {
                productId,
                sku: body.sku ? String(body.sku).trim() : null,
                barcode: body.barcode ? String(body.barcode).trim() : null,
                optionsLabel: buildOptionsLabel(options),
                options,
                sellingPrice: body.selling_price !== undefined && body.selling_price !== null ? Number(body.selling_price) : null,
                buyingPrice: body.buying_price !== undefined && body.buying_price !== null ? Number(body.buying_price) : null,
                weightValue: body.weight_value !== undefined && body.weight_value !== null ? Number(body.weight_value) : null,
                stock: body.stock !== undefined ? Math.max(0, Number(body.stock) || 0) : 0,
                status: body.status || "active",
                position: count,
                createdById: accountId,
            },
            include: includeImages,
        });
        return variant;
    } catch (error) {
        if (error.code === "P2002") {
            throw new ApiError(409, "A variant with this SKU already exists for this product");
        }
        throw error;
    }
};

export const updateVariant = async (variantId, body) => {
    const data = {};
    if (body.sku !== undefined) data.sku = body.sku ? String(body.sku).trim() : null;
    if (body.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode).trim() : null;
    if (body.options !== undefined) {
        const options = validateOptions(body.options);
        data.options = options;
        data.optionsLabel = buildOptionsLabel(options);
    }
    if (body.selling_price !== undefined) data.sellingPrice = body.selling_price === null ? null : Number(body.selling_price);
    if (body.buying_price !== undefined) data.buyingPrice = body.buying_price === null ? null : Number(body.buying_price);
    if (body.weight_value !== undefined) data.weightValue = body.weight_value === null ? null : Number(body.weight_value);
    if (body.status !== undefined) data.status = body.status;

    try {
        return await prisma.productVariant.update({
            where: { id: variantId },
            data,
            include: includeImages,
        });
    } catch (error) {
        if (error.code === "P2002") {
            throw new ApiError(409, "A variant with this SKU already exists for this product");
        }
        throw error;
    }
};

export const deleteVariant = (variantId) => prisma.productVariant.delete({ where: { id: variantId } });

// Atomically claims `quantity` units of one variant's own stock cache -
// exact same compare-and-swap idiom as
// productLocationStock.service.js#claimLocationStock, just against
// ProductVariant.stock instead of ProductLocationStock.stock. Returns the
// new balance on success, or null on failure (never throws).
export const claimVariantStock = async (tx, { variantId, quantity }) => {
    const claim = await tx.productVariant.updateMany({
        where: { id: variantId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
    });
    if (claim.count === 0) return null;

    const row = await tx.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stock: true },
    });
    return row.stock;
};

export const creditVariantStock = async (tx, { variantId, quantity }) => {
    const row = await tx.productVariant.update({
        where: { id: variantId },
        data: { stock: { increment: quantity } },
    });
    return row.stock;
};

// Explicit, audited stock correction for one variant - same shape as
// product.controller.js#adjustProductStock, but against the variant's own
// account-wide cache (see ProductVariant's schema comment on why it isn't
// per-location yet). sourceType/sourceId default to a manual adjustment;
// a connector sync passes "channel_sync" and its own sourceId instead.
export const adjustVariantStock = async ({
    variant,
    productId,
    accountId,
    pointOfSaleId,
    delta,
    reason,
    actorId,
    sourceType = "adjustment",
    sourceId = null,
}) => {
    if (!Number.isInteger(delta) || delta === 0) {
        throw new ApiError(400, "Delta must be a non-zero integer");
    }

    return prisma.$transaction(async (tx) => {
        const balance =
            delta < 0
                ? await claimVariantStock(tx, { variantId: variant.id, quantity: -delta })
                : await creditVariantStock(tx, { variantId: variant.id, quantity: delta });

        if (balance === null) {
            throw new ApiError(409, "Not enough stock to apply this adjustment");
        }

        await recordStockMovement(tx, {
            productId,
            accountId,
            pointOfSaleId,
            variantId: variant.id,
            delta,
            balanceAfter: balance,
            sourceType,
            sourceId,
            reason: reason ?? null,
            createdById: actorId,
        });

        return tx.productVariant.findUniqueOrThrow({ where: { id: variant.id }, include: includeImages });
    });
};
