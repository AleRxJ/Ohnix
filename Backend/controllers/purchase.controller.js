import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import purchaseService from "../services/purchase.service.js";
import { prisma } from "../db/prisma.js";
import { resolveOrAssertPointOfSaleId, hasPosAccess } from "../middleware/pos.permissions.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapPurchase = (purchase) => ({
    _id: toExternalId(purchase),
    purchase_no: purchase.purchaseNo,
    purchase_date: purchase.purchaseDate,
    purchase_status: purchase.purchaseStatus,
    supplier_id: purchase.supplier
        ? {
              _id: toExternalId(purchase.supplier),
              name: purchase.supplier.name,
              shopname: purchase.supplier.shopname,
          }
        : null,
    created_by: purchase.createdBy
        ? {
              _id: toExternalId(purchase.createdBy),
              username: purchase.createdBy.username,
          }
        : null,
    updated_by: purchase.updatedBy
        ? {
              _id: toExternalId(purchase.updatedBy),
              username: purchase.updatedBy.username,
          }
        : null,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
});

const mapPurchaseDetail = (detail) => ({
    _id: toExternalId(detail),
    purchase_id: detail.purchase
        ? toExternalId(detail.purchase)
        : detail.purchaseId,
    product_id: detail.product
        ? {
              _id: toExternalId(detail.product),
              product_name: detail.product.productName,
              product_code: detail.product.productCode,
              stock: detail.product.stock,
          }
        : null,
    quantity: detail.quantity,
    unitcost: Number(detail.unitcost),
    total: Number(detail.total),
    return_date: detail.returnDate,
    returned_quantity: detail.returnedQuantity,
    pending_quantity: detail.quantity - detail.returnedQuantity,
    refund_amount: Number(detail.refundAmount),
    fully_returned: detail.returnedQuantity === detail.quantity,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
});

const findPurchaseByAnyId = async (id) =>
    prisma.purchase.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            supplier: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    name: true,
                    shopname: true,
                },
            },
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

const createPurchase = asyncHandler(async (req, res, next) => {
    try {
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
        const purchase = await purchaseService.createPurchase(
            req.body,
            req.user.prismaId,
            req.user.role,
            pointOfSaleId
        );

        const fullPurchase = await findPurchaseByAnyId(purchase._id);

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    fullPurchase ? mapPurchase(fullPurchase) : purchase,
                    "Purchase created successfully"
                )
            );
    } catch (err) {
        return next(err);
    }
});

const getAllPurchases = asyncHandler(async (req, res, next) => {
    try {
        const where =
            req.user.role === "admin"
                ? {}
                : {
                      createdById: req.user.prismaId,
                      ...(req.user.posScopeAll ? {} : { pointOfSaleId: { in: req.user.posScopeIds || [] } }),
                  };

        const purchases = await prisma.purchase.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                supplier: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        name: true,
                        shopname: true,
                    },
                },
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
                    purchases.map(mapPurchase),
                    "Purchases fetched successfully"
                )
            );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getPurchaseDetails = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const purchase = await findPurchaseByAnyId(id);

        if (!purchase) {
            return next(new ApiError(404, "Purchase not found"));
        }

        if (req.user.role !== "admin" && purchase.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You don't have permission to view this purchase")
            );
        }
        if (req.user.role !== "admin" && !hasPosAccess(req.user, purchase.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        const details = await prisma.purchaseDetail.findMany({
            where: { purchaseId: purchase.id },
            include: {
                purchase: {
                    select: { id: true, legacyMongoId: true },
                },
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        productCode: true,
                        stock: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    details.map(mapPurchaseDetail),
                    "Purchase details fetched successfully"
                )
            );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updatePurchaseStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { purchase_status } = req.body;

    if (!purchase_status) {
        return next(new ApiError(400, "Purchase status is required"));
    }

    try {
        const result = await purchaseService.updatePurchaseStatus(
            id,
            purchase_status,
            req.user.prismaId,
            req.user.role,
            req.user
        );

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    result,
                    `Purchase status updated to ${purchase_status} successfully`
                )
            );
    } catch (err) {
        return next(err);
    }
});

const getReturnPreview = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const purchase = await findPurchaseByAnyId(id);

        if (!purchase) {
            return next(new ApiError(404, "Purchase not found"));
        }

        if (req.user.role !== "admin" && purchase.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You don't have permission to view this purchase")
            );
        }
        if (req.user.role !== "admin" && !hasPosAccess(req.user, purchase.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        if (purchase.purchaseStatus === "returned") {
            return next(new ApiError(400, "Purchase is already returned"));
        }

        if (purchase.purchaseStatus !== "completed") {
            return next(new ApiError(400, "Only completed purchases can be returned"));
        }

        const purchaseDetails = await prisma.purchaseDetail.findMany({
            where: { purchaseId: purchase.id },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        stock: true,
                    },
                },
            },
        });

        let totalPotentialRefund = 0;

        const returnPreview = purchaseDetails.map((detail) => {
            const product = detail.product;
            const pendingQuantity = detail.quantity - detail.returnedQuantity;
            const returnableQuantity = Math.max(Math.min(pendingQuantity, product.stock), 0);
            const refundAmount = returnableQuantity * Number(detail.unitcost);
            totalPotentialRefund += refundAmount;

            return {
                purchase_detail_id: toExternalId(detail),
                product_id: toExternalId(product),
                product_name: product.productName,
                purchased_quantity: detail.quantity,
                already_returned_quantity: detail.returnedQuantity,
                pending_quantity: Math.max(pendingQuantity, 0),
                current_stock: product.stock,
                returnable_quantity: returnableQuantity,
                unit_cost: Number(detail.unitcost),
                potential_refund: refundAmount,
                can_fully_return: returnableQuantity === pendingQuantity,
            };
        });

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    purchase_id: toExternalId(purchase),
                    purchase_no: purchase.purchaseNo,
                    total_potential_refund: totalPotentialRefund,
                    return_preview: returnPreview,
                },
                "Return preview generated successfully"
            )
        );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const processReturn = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { lines } = req.body;

    if (!Array.isArray(lines) || lines.length === 0) {
        return next(new ApiError(400, "At least one return line is required"));
    }

    try {
        const result = await purchaseService.processReturn(
            id,
            lines,
            req.user.prismaId,
            req.user.role,
            req.user
        );

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    result,
                    result.purchase_fully_returned
                        ? "Purchase fully returned"
                        : "Return processed successfully"
                )
            );
    } catch (err) {
        return next(err);
    }
});

export {
    createPurchase,
    getAllPurchases,
    getPurchaseDetails,
    updatePurchaseStatus,
    getReturnPreview,
    processReturn,
};
