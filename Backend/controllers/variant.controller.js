import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { emitAccountEvent } from "../live/dataEvents.js";
import { enqueueWebhookEvent } from "../services/webhookDispatch.service.js";
import { resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import { findProductByAnyId } from "./product.controller.js";
import {
    mapVariant,
    listVariants,
    findVariantById,
    createVariant,
    updateVariant,
    deleteVariant,
    adjustVariantStock,
} from "../services/variant.service.js";

const assertOwnership = (product, req) => {
    if (req.user.role !== "admin" && product.createdById !== req.user.prismaId) {
        throw new ApiError(403, "You don't have permission to manage this product's variants");
    }
};

const notifyProductUpdated = (product) => {
    emitAccountEvent(product.createdById, "product", "updated");
    enqueueWebhookEvent(product.createdById, "product.updated", { product_id: product.id }).catch(() => {});
};

export const getVariants = asyncHandler(async (req, res, next) => {
    const product = await findProductByAnyId(req.params.id);
    if (!product) return next(new ApiError(404, "Product not found"));
    assertOwnership(product, req);

    const variants = await listVariants(product.id);
    return res.status(200).json(new ApiResponse(200, variants.map(mapVariant), "Variants fetched successfully"));
});

export const postVariant = asyncHandler(async (req, res, next) => {
    const product = await findProductByAnyId(req.params.id);
    if (!product) return next(new ApiError(404, "Product not found"));
    assertOwnership(product, req);

    try {
        const variant = await createVariant(product.id, req.user.prismaId, req.body || {});
        notifyProductUpdated(product);
        return res.status(201).json(new ApiResponse(201, mapVariant(variant), "Variant created successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const loadOwnedVariant = async (req) => {
    const variant = await findVariantById(req.params.variantId);
    if (!variant) throw new ApiError(404, "Variant not found");
    const product = await findProductByAnyId(variant.productId);
    assertOwnership(product, req);
    return { variant, product };
};

export const patchVariant = asyncHandler(async (req, res, next) => {
    try {
        const { variant, product } = await loadOwnedVariant(req);
        const updated = await updateVariant(variant.id, req.body || {});
        notifyProductUpdated(product);
        return res.status(200).json(new ApiResponse(200, mapVariant(updated), "Variant updated successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export const removeVariant = asyncHandler(async (req, res, next) => {
    try {
        const { variant, product } = await loadOwnedVariant(req);
        await deleteVariant(variant.id);
        notifyProductUpdated(product);
        return res.status(200).json(new ApiResponse(200, {}, "Variant deleted successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        if (error.code === "P2003") {
            return next(
                new ApiError(409, "This variant can't be deleted because it has order history on record.")
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export const postVariantAdjustStock = asyncHandler(async (req, res, next) => {
    const { delta, reason } = req.body || {};
    const parsedDelta = Number(delta);
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
        return next(new ApiError(400, "Delta must be a non-zero integer"));
    }
    if (!reason || !String(reason).trim()) {
        return next(new ApiError(400, "A reason is required to adjust stock"));
    }

    try {
        const { variant, product } = await loadOwnedVariant(req);
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);

        const updated = await adjustVariantStock({
            variant,
            productId: product.id,
            accountId: product.createdById,
            pointOfSaleId,
            delta: parsedDelta,
            reason: String(reason).trim(),
            actorId: req.user.prismaId,
        });

        notifyProductUpdated(product);
        enqueueWebhookEvent(product.createdById, "inventory.updated", {
            product_id: product.id,
            variant_id: variant.id,
            stock: updated.stock,
        }).catch(() => {});

        return res.status(200).json(new ApiResponse(200, mapVariant(updated), "Stock adjusted successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});
