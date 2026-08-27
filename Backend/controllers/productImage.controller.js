import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile } from "../utils/storage.js";
import { prisma } from "../db/prisma.js";
import { emitAccountEvent } from "../live/dataEvents.js";
import { scopedStockForProducts } from "../services/productLocationStock.service.js";
import {
    attachImage,
    deleteImage,
    setPrimaryImage,
    reorderImages,
    MAX_PRODUCT_IMAGES,
} from "../services/productImage.service.js";
import { mapProduct, findProductByAnyId } from "./product.controller.js";

// Same ownership rule duplicated across every mutation in
// product.controller.js (updateProduct/deleteProduct/adjustProductStock) -
// non-admins only ever act on their own account's products.
const assertOwnership = (existingProduct, req) => {
    if (req.user.role !== "admin" && existingProduct.createdById !== req.user.prismaId) {
        throw new ApiError(403, "You don't have permission to modify this product's images");
    }
};

const respondWithProduct = async (res, status, productId, req, message) => {
    const product = await findProductByAnyId(productId);
    const scopedStock = await scopedStockForProducts(req.user, [product.id]);
    return res
        .status(status)
        .json(new ApiResponse(status, mapProduct(product, scopedStock?.get(product.id)), message));
};

const addProductImages = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);
        if (!existingProduct) return next(new ApiError(404, "Product not found"));
        assertOwnership(existingProduct, req);

        const files = req.files || [];
        if (files.length === 0) {
            return next(new ApiError(400, "At least one image is required"));
        }

        if (existingProduct.images.length + files.length > MAX_PRODUCT_IMAGES) {
            return next(
                new ApiError(400, `A product can have at most ${MAX_PRODUCT_IMAGES} images`)
            );
        }

        for (const file of files) {
            const uploaded = await uploadFile(file, {
                ownerId: req.user.prismaId,
                entity: "products",
            });
            if (uploaded) {
                await attachImage(prisma, existingProduct.id, uploaded.url);
            }
        }

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        return await respondWithProduct(res, 201, existingProduct.id, req, "Images added successfully");
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const deleteProductImage = asyncHandler(async (req, res, next) => {
    const { id, imageId } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);
        if (!existingProduct) return next(new ApiError(404, "Product not found"));
        assertOwnership(existingProduct, req);

        await deleteImage(prisma, existingProduct.id, imageId);

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        return await respondWithProduct(res, 200, existingProduct.id, req, "Image deleted successfully");
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const setPrimaryProductImage = asyncHandler(async (req, res, next) => {
    const { id, imageId } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);
        if (!existingProduct) return next(new ApiError(404, "Product not found"));
        assertOwnership(existingProduct, req);

        await setPrimaryImage(prisma, existingProduct.id, imageId);

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        return await respondWithProduct(res, 200, existingProduct.id, req, "Primary image updated successfully");
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const reorderProductImages = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { image_ids } = req.body || {};

    if (!Array.isArray(image_ids) || image_ids.length === 0) {
        return next(new ApiError(400, "image_ids must be a non-empty array"));
    }

    try {
        const existingProduct = await findProductByAnyId(id);
        if (!existingProduct) return next(new ApiError(404, "Product not found"));
        assertOwnership(existingProduct, req);

        await reorderImages(prisma, existingProduct.id, image_ids);

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        return await respondWithProduct(res, 200, existingProduct.id, req, "Images reordered successfully");
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export { addProductImages, deleteProductImage, setPrimaryProductImage, reorderProductImages };
