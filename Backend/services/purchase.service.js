import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { emitAccountEvent } from "../live/dataEvents.js";

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
        const { supplier_id, purchase_no, purchase_status, details, is_tutorial_data } = purchaseData;

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
            throw new ApiError(
                400,
                "Duplicate products in purchase details",
                [],
                "",
                "duplicate_purchase_products"
            );
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
                        isTutorialData: is_tutorial_data === true,
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
                        const updatedProduct = await tx.product.update({
                            where: { id: mappedProduct.id },
                            data: {
                                stock: {
                                    increment: Number(detail.quantity),
                                },
                            },
                            select: { stock: true },
                        });

                        await recordStockMovement(tx, {
                            productId: mappedProduct.id,
                            accountId: mappedProduct.createdById,
                            delta: Number(detail.quantity),
                            balanceAfter: updatedProduct.stock,
                            sourceType: "purchase",
                            sourceId: createdPurchase.id,
                            createdById: userId,
                        });
                    }
                }

                return createdPurchase;
            });

            emitAccountEvent(userId, "purchase", "created");
            if (shouldAddStock) emitAccountEvent(userId, "product", "stock-changed");

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

        // "returned" is no longer a client-settable transition - it's only
        // ever reached as a side effect of processReturn() once every line
        // has nothing left pending. See that method for the return flow.
        const validTransitions = {
            pending: ["completed"],
            completed: [],
            returned: [],
        };

        if (!validTransitions[purchase.purchaseStatus]?.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition purchase from "${purchase.purchaseStatus}" to "${newStatus}"`,
                [],
                "",
                "invalid_purchase_status_transition"
            );
        }

        const updatedPurchase = await prisma.$transaction(async (tx) => {
            // Atomically claim this transition before touching any stock -
            // the purchaseStatus/validTransitions check above read from a
            // query executed before this transaction started, so by itself
            // it can't stop two concurrent "completed" requests for the same
            // purchase from both passing it and both adding stock. This
            // UPDATE ... WHERE forces Postgres to serialize concurrent
            // callers on this row - the loser's WHERE clause re-evaluates
            // against the already-committed new status once it can proceed,
            // matching 0 rows (same technique already used by
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

            if (newStatus === "completed") {
                const purchaseDetails = await tx.purchaseDetail.findMany({
                    where: { purchaseId: purchase.id },
                    select: {
                        productId: true,
                        quantity: true,
                        product: { select: { createdById: true } },
                    },
                });

                for (const detail of purchaseDetails) {
                    const updatedProduct = await tx.product.update({
                        where: { id: detail.productId },
                        data: {
                            stock: {
                                increment: detail.quantity,
                            },
                        },
                        select: { stock: true },
                    });

                    await recordStockMovement(tx, {
                        productId: detail.productId,
                        accountId: detail.product.createdById,
                        delta: detail.quantity,
                        balanceAfter: updatedProduct.stock,
                        sourceType: "purchase",
                        sourceId: purchase.id,
                        createdById: userId,
                    });
                }
            }

            // Status/updatedById were already written atomically by the
            // claim above - just read back the current row for the response.
            return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
        });

        emitAccountEvent(purchase.createdById, "purchase", "updated");
        if (newStatus === "completed") emitAccountEvent(purchase.createdById, "product", "stock-changed");

        return {
            purchase: {
                _id: toExternalId(updatedPurchase),
                purchase_status: updatedPurchase.purchaseStatus,
                purchase_no: updatedPurchase.purchaseNo,
                purchase_date: updatedPurchase.purchaseDate,
                createdAt: updatedPurchase.createdAt,
                updatedAt: updatedPurchase.updatedAt,
            },
        };
    }

    // Explicit, per-line return: the caller picks which purchase details to
    // return and how much of each, instead of the system silently returning
    // "whatever is still in stock" for every line at once. Can be called more
    // than once per purchase while any line still has quantity - returnedQuantity
    // > 0 left. purchaseStatus only flips to "returned" once every line on the
    // purchase has nothing left pending - see the schema comment on
    // PurchaseDetail for why returnedQuantity/refundAmount are running totals.
    async processReturn(purchaseId, lines, userId, userRole) {
        const purchase = await findPurchaseByAnyId(purchaseId);

        if (!purchase) {
            throw new ApiError(404, "Purchase not found");
        }

        if (userRole !== "admin" && purchase.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to return items from this purchase");
        }

        if (purchase.purchaseStatus !== "completed") {
            throw new ApiError(
                400,
                purchase.purchaseStatus === "returned"
                    ? "This purchase has already been fully returned"
                    : "Only completed purchases can be returned",
                [],
                "",
                "purchase_not_returnable"
            );
        }

        if (!Array.isArray(lines) || lines.length === 0) {
            throw new ApiError(400, "At least one return line is required");
        }

        const detailIds = lines.map((l) => l.purchase_detail_id?.toString()).filter(Boolean);
        const uniqueDetailIds = [...new Set(detailIds)];
        if (detailIds.length !== lines.length || uniqueDetailIds.length !== detailIds.length) {
            throw new ApiError(400, "Duplicate or missing purchase detail id in return request");
        }

        for (const line of lines) {
            const quantity = Number(line.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new ApiError(400, "Quantity must be a positive integer for every return line");
            }
        }

        // Matched by id OR legacyMongoId, same "any id" pattern as
        // findProductByAnyId/findPurchaseByAnyId above - getReturnPreview
        // hands the client toExternalId(detail), which is the legacy id for
        // rows migrated from Mongo.
        const details = await prisma.purchaseDetail.findMany({
            where: {
                purchaseId: purchase.id,
                OR: [{ id: { in: uniqueDetailIds } }, { legacyMongoId: { in: uniqueDetailIds } }],
            },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        stock: true,
                        createdById: true,
                    },
                },
            },
        });

        if (details.length !== uniqueDetailIds.length) {
            throw new ApiError(400, "One or more return lines do not belong to this purchase");
        }

        const detailById = new Map(details.map((d) => [toExternalId(d), d]));

        const insufficientItems = [];
        for (const line of lines) {
            const detail = detailById.get(line.purchase_detail_id);
            const pending = detail.quantity - detail.returnedQuantity;
            const maxReturnable = Math.min(pending, detail.product.stock);
            if (Number(line.quantity) > maxReturnable) {
                insufficientItems.push({
                    purchase_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    requested: Number(line.quantity),
                    available: Math.max(maxReturnable, 0),
                    reason: pending <= 0 ? "already_fully_returned" : "insufficient_stock",
                });
            }
        }

        if (insufficientItems.length > 0) {
            throw new ApiError(
                422,
                "One or more return lines exceed what can be returned",
                insufficientItems
            );
        }

        const { results, purchaseFullyReturned } = await prisma.$transaction(async (tx) => {
            const results = [];

            for (const line of lines) {
                const detail = detailById.get(line.purchase_detail_id);
                const quantity = Number(line.quantity);

                // Same atomic-claim idiom as adjustProductStock and the
                // "completed" branch above: the stock read used for the
                // insufficientItems check predates this transaction, so it
                // can't by itself stop a concurrent sale/adjustment from
                // taking the same stock in between.
                const claim = await tx.product.updateMany({
                    where: { id: detail.product.id, stock: { gte: quantity } },
                    data: { stock: { decrement: quantity } },
                });

                if (claim.count === 0) {
                    throw new ApiError(
                        409,
                        `Not enough stock left to return "${detail.product.productName}". Please refresh and try again.`
                    );
                }

                const updatedProduct = await tx.product.findUniqueOrThrow({
                    where: { id: detail.product.id },
                    select: { stock: true },
                });

                await recordStockMovement(tx, {
                    productId: detail.product.id,
                    accountId: detail.product.createdById,
                    delta: -quantity,
                    balanceAfter: updatedProduct.stock,
                    sourceType: "purchase_return",
                    sourceId: purchase.id,
                    createdById: userId,
                });

                const refundNow = quantity * Number(detail.unitcost);

                // Same claim idiom as the product stock update just above:
                // the returnedQuantity read that fed the insufficientItems
                // check predates this transaction, so without this guard two
                // concurrent returns on the *same line* could each pass
                // validation and both increment it, pushing returnedQuantity
                // past quantity even though the product-stock claim alone
                // would still stop physical stock from going negative.
                const detailClaim = await tx.purchaseDetail.updateMany({
                    where: { id: detail.id, returnedQuantity: detail.returnedQuantity },
                    data: {
                        returnDate: new Date(),
                        returnedQuantity: { increment: quantity },
                        refundAmount: { increment: refundNow },
                    },
                });

                if (detailClaim.count === 0) {
                    throw new ApiError(
                        409,
                        `"${detail.product.productName}" was returned by another request. Please refresh and try again.`
                    );
                }

                const updatedDetail = await tx.purchaseDetail.findUniqueOrThrow({
                    where: { id: detail.id },
                    select: { returnedQuantity: true, refundAmount: true },
                });

                results.push({
                    purchase_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    returned_now: quantity,
                    refund_now: refundNow,
                    returned_quantity: updatedDetail.returnedQuantity,
                    refund_amount: Number(updatedDetail.refundAmount),
                    pending_quantity: detail.quantity - updatedDetail.returnedQuantity,
                    fully_returned: updatedDetail.returnedQuantity === detail.quantity,
                });
            }

            const allDetails = await tx.purchaseDetail.findMany({
                where: { purchaseId: purchase.id },
                select: { quantity: true, returnedQuantity: true },
            });
            const purchaseFullyReturned = allDetails.every(
                (d) => d.returnedQuantity === d.quantity
            );

            if (purchaseFullyReturned) {
                await tx.purchase.updateMany({
                    where: { id: purchase.id, purchaseStatus: "completed" },
                    data: { purchaseStatus: "returned", updatedById: userId },
                });
            }

            return { results, purchaseFullyReturned };
        });

        emitAccountEvent(purchase.createdById, "purchase", "updated");
        emitAccountEvent(purchase.createdById, "product", "stock-changed");

        return {
            purchase_id: toExternalId(purchase),
            purchase_status: purchaseFullyReturned ? "returned" : "completed",
            purchase_fully_returned: purchaseFullyReturned,
            total_refund_amount: results.reduce((sum, r) => sum + r.refund_now, 0),
            return_details: results,
        };
    }
}

export default new PurchaseService();
