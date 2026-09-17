import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import * as productionOrderService from "../services/productionOrder.service.js";

export const createProductionOrder = asyncHandler(async (req, res, next) => {
    const { product_id, quantity, labor_cost, overhead_cost, batch_number, batch_expiration_date, notes } = req.body || {};
    if (!product_id) return next(new ApiError(400, "product_id is required"));

    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);

    const order = await productionOrderService.createProductionOrder({
        productId: product_id,
        pointOfSaleId,
        quantity,
        laborCost: labor_cost,
        overheadCost: overhead_cost,
        batchNumber: batch_number,
        batchExpirationDate: batch_expiration_date,
        notes,
        userId: req.user.prismaId,
        userRole: req.user.role,
    });
    return res.status(201).json(new ApiResponse(201, order, "Production order created successfully"));
});

export const listProductionOrders = asyncHandler(async (req, res) => {
    const { status, product_id, point_of_sale_id } = req.query;
    const orders = await productionOrderService.listProductionOrders({
        accountId: req.user.role === "admin" ? req.query.account_id || req.user.prismaId : req.user.prismaId,
        status: status || undefined,
        productId: product_id || undefined,
        pointOfSaleId: point_of_sale_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, orders, "Production orders fetched successfully"));
});

export const getProductionOrder = asyncHandler(async (req, res) => {
    const order = await productionOrderService.getProductionOrder(req.user.prismaId, req.params.id);
    return res.status(200).json(new ApiResponse(200, order, "Production order fetched successfully"));
});

export const completeProductionOrder = asyncHandler(async (req, res) => {
    const order = await productionOrderService.completeProductionOrder({
        orderId: req.params.id,
        userId: req.user.prismaId,
        userRole: req.user.role,
        actingUser: req.user,
    });
    return res.status(200).json(new ApiResponse(200, order, "Production order completed successfully"));
});

export const cancelProductionOrder = asyncHandler(async (req, res) => {
    const order = await productionOrderService.cancelProductionOrder({
        orderId: req.params.id,
        userId: req.user.prismaId,
        userRole: req.user.role,
        actingUser: req.user,
        reason: req.body?.reason,
    });
    return res.status(200).json(new ApiResponse(200, order, "Production order cancelled successfully"));
});
