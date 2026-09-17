import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { findProductByAnyId, mapProduct } from "./product.controller.js";
import { scopedStockForProducts } from "../services/productLocationStock.service.js";

// Single-product lookup - every other public product endpoint is either a
// list (GET /products) or a mutation; a connector/custom integration still
// needs a plain "fetch one by id" to refresh a single row without re-
// listing the whole catalog. Reuses the exact same findProductByAnyId/
// mapProduct the internal dashboard uses, so the response shape (and
// what counts as "not found" - id or legacyMongoId) never diverges.
export const getPublicProduct = asyncHandler(async (req, res, next) => {
    const product = await findProductByAnyId(req.params.id);
    if (!product || (req.user.role !== "admin" && product.createdById !== req.user.prismaId)) {
        return next(new ApiError(404, "Product not found"));
    }
    const scopedStock = await scopedStockForProducts(req.user, [product.id]);
    return res.status(200).json(new ApiResponse(200, mapProduct(product, scopedStock?.get(product.id)), "Product fetched successfully"));
});
