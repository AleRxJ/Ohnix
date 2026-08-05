import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const findSupplierByAnyId = async (id) =>
    prisma.supplier.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: { id: true, createdById: true },
    });

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            createdById: true,
            productName: true,
            productCode: true,
            stock: true,
        },
    });

const findPurchaseByAnyId = async (id) =>
    prisma.purchase.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            purchaseStatus: true,
            createdById: true,
        },
    });

class PurchaseService {
    async createPurchase(purchaseData, userId, userRole) {
        const { supplier_id, purchase_no, purchase_status, details } = purchaseData;

        if (
            !supplier_id ||
            !purchase_no ||
            !Array.isArray(details) ||
            details.length === 0
        ) {
            throw new ApiError(400, "Invalid purchase data");
        }

        const supplier = await findSupplierByAnyId(supplier_id);
        if (!supplier) {
            throw new ApiError(404, "Supplier not found");
        }

        if (userRole !== "admin" && supplier.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to use this supplier");
        }

        const productIds = details.map((d) => d.product_id?.toString()).filter(Boolean);
        const uniqueProductIds = [...new Set(productIds)];
        if (uniqueProductIds.length !== productIds.length) {
            throw new ApiError(400, "Duplicate products in purchase details");
        }

        const products = await Promise.all(uniqueProductIds.map((id) => findProductByAnyId(id)));
        if (products.some((p) => !p)) {
            throw new ApiError(400, "One or more products not found");
        }

        for (const product of products) {
            if (userRole !== "admin" && product.createdById !== userId) {
                throw new ApiError(403, "You don't have permission to use one or more products");
            }
        }

        for (const d of details) {
            if (!d.quantity || Number(d.quantity) < 1) {
                throw new ApiError(400, "Quantity must be at least 1 for all items");
            }
            if (d.unitcost === undefined || Number(d.unitcost) < 0) {
                throw new ApiError(400, "Unit cost must be non-negative for all items");
            }
        }

        const existing = await prisma.purchase.findUnique({
            where: { purchaseNo: String(purchase_no).trim() },
            select: { id: true },
        });
        if (existing) {
            throw new ApiError(409, "Purchase number already exists");
        }

        const initialStatus = purchase_status || "pending";
        if (!["pending", "completed"].includes(initialStatus)) {
            throw new ApiError(400, `Invalid purchase status: ${initialStatus}`);
        }

        const shouldAddStock = initialStatus === "completed";

        try {
            const purchase = await prisma.$transaction(async (tx) => {
                const createdPurchase = await tx.purchase.create({
                    data: {
                        supplierId: supplier.id,
                        purchaseNo: String(purchase_no).trim(),
                        purchaseStatus: initialStatus,
                        createdById: userId,
                        updatedById: userId,
                    },
                });

                for (const detail of details) {
                    const mappedProduct = await findProductByAnyId(detail.product_id);
                    if (!mappedProduct) {
                        throw new ApiError(400, "One or more products not found");
                    }

                    await tx.purchaseDetail.create({
                        data: {
                            purchaseId: createdPurchase.id,
                            productId: mappedProduct.id,
                            quantity: Number(detail.quantity),
                            unitcost: Number(detail.unitcost),
                            total: Number(detail.quantity) * Number(detail.unitcost),
                        },
                    });

                    if (shouldAddStock) {
                        await tx.product.update({
                            where: { id: mappedProduct.id },
                            data: {
                                stock: {
                                    increment: Number(detail.quantity),
                                },
                            },
                        });
                    }
                }

                return createdPurchase;
            });

            return {
                _id: toExternalId(purchase),
                purchase_no: purchase.purchaseNo,
                purchase_date: purchase.purchaseDate,
                purchase_status: purchase.purchaseStatus,
                supplier_id,
                created_by: userId,
                createdAt: purchase.createdAt,
                updatedAt: purchase.updatedAt,
            };
        } catch (err) {
            if (err.code === "P2002") {
                throw new ApiError(409, "Purchase number already exists");
            }
            throw err;
        }
    }

    async updatePurchaseStatus(purchaseId, newStatus, userId, userRole) {
        const purchase = await findPurchaseByAnyId(purchaseId);

        if (!purchase) {
            throw new ApiError(404, "Purchase not found");
        }

        if (userRole !== "admin" && purchase.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to update this purchase");
        }

        const validTransitions = {
            pending: ["completed"],
            completed: ["returned"],
            returned: [],
        };

        if (!validTransitions[purchase.purchaseStatus]?.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition purchase from "${purchase.purchaseStatus}" to "${newStatus}"`
            );
        }

        let returnInfo = null;

        const updatedPurchase = await prisma.$transaction(async (tx) => {
            // Atomically claim this transition before touching any stock or
            // refund data - the purchaseStatus/validTransitions check above
            // read from a query executed before this transaction started, so
            // by itself it can't stop two concurrent "returned" (or
            // "completed") requests for the same purchase from both passing
            // it and both mutating stock/refunds. This UPDATE ... WHERE
            // forces Postgres to serialize concurrent callers on this row -
            // the loser's WHERE clause re-evaluates against the
            // already-committed new status once it can proceed, matching 0
            // rows (same technique already used by
            // subscription.controller.js's closeApprovedRequestAndActivatePlan).
            const claim = await tx.purchase.updateMany({
                where: { id: purchase.id, purchaseStatus: purchase.purchaseStatus },
                data: { purchaseStatus: newStatus, updatedById: userId },
            });

            if (claim.count === 0) {
                throw new ApiError(
                    409,
                    "This purchase was already updated by another request. Please refresh and try again."
                );
            }

            if (newStatus === "returned") {
                const details = await tx.purchaseDetail.findMany({
                    where: { purchaseId: purchase.id },
                    include: {
                        product: {
                            select: {
                                id: true,
                                legacyMongoId: true,
                                stock: true,
                            },
                        },
                    },
                });

                const returnResults = [];
                let totalRefundAmount = 0;

                for (const detail of details) {
                    if (detail.returnProcessed) {
                        returnResults.push({
                            product_id: toExternalId(detail.product),
                            purchased_quantity: detail.quantity,
                            returned_quantity: detail.returnedQuantity,
                            refund_amount: Number(detail.refundAmount),
                            fully_returned:
                                detail.returnedQuantity === detail.quantity,
                            skipped: true,
                        });
                        totalRefundAmount += Number(detail.refundAmount);
                        continue;
                    }

                    const returnableQuantity = Math.min(
                        detail.quantity,
                        detail.product.stock
                    );

                    if (returnableQuantity > 0) {
                        await tx.product.update({
                            where: { id: detail.product.id },
                            data: {
                                stock: {
                                    decrement: returnableQuantity,
                                },
                            },
                        });
                    }

                    const refundAmount = returnableQuantity * Number(detail.unitcost);
                    totalRefundAmount += refundAmount;

                    await tx.purchaseDetail.update({
                        where: { id: detail.id },
                        data: {
                            returnProcessed: true,
                            returnDate: new Date(),
                            returnedQuantity: returnableQuantity,
                            refundAmount,
                        },
                    });

                    returnResults.push({
                        product_id: toExternalId(detail.product),
                        purchased_quantity: detail.quantity,
                        returned_quantity: returnableQuantity,
                        refund_amount: refundAmount,
                        fully_returned: returnableQuantity === detail.quantity,
                    });
                }

                returnInfo = {
                    total_refund_amount: totalRefundAmount,
                    return_details: returnResults,
                    return_summary: {
                        total_items_processed: returnResults.length,
                        fully_returned_items: returnResults.filter((i) => i.fully_returned)
                            .length,
                        partially_returned_items: returnResults.filter(
                            (i) => !i.fully_returned
                        ).length,
                    },
                };
            } else if (newStatus === "completed") {
                const purchaseDetails = await tx.purchaseDetail.findMany({
                    where: { purchaseId: purchase.id },
                    select: { productId: true, quantity: true },
                });

                for (const detail of purchaseDetails) {
                    await tx.product.update({
                        where: { id: detail.productId },
                        data: {
                            stock: {
                                increment: detail.quantity,
                            },
                        },
                    });
                }
            }

            // Status/updatedById were already written atomically by the
            // claim above - just read back the current row for the response.
            return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
        });

        return {
            purchase: {
                _id: toExternalId(updatedPurchase),
                purchase_status: updatedPurchase.purchaseStatus,
                purchase_no: updatedPurchase.purchaseNo,
                purchase_date: updatedPurchase.purchaseDate,
                createdAt: updatedPurchase.createdAt,
                updatedAt: updatedPurchase.updatedAt,
            },
            ...(returnInfo && { returnInfo }),
        };
    }
}

export default new PurchaseService();
