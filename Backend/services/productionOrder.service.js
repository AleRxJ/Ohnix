import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { claimLocationStockWithCost, creditLocationStockWithCost, getLocationStock } from "./productLocationStock.service.js";
import { claimBatchesFEFO, claimNamedBatch, creditBatch, creditBatchReturn } from "./productBatch.service.js";
import { postProductionJournalEntry, postProductionReversalJournalEntry } from "./accountingPosting.service.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";

// A production order is a discrete, user-triggered transformation of raw
// materials into a manufactured product - see ProductionOrder's schema
// comment for the full draft -> completed -> cancelled lifecycle and why
// completion is the only step that actually touches stock/accounting.

const toExternalId = (entity) => entity.legacyMongoId || entity.id;
const round2 = (value) => Number(Number(value).toFixed(2));

const COMPONENT_SELECT = {
    id: true,
    legacyMongoId: true,
    productName: true,
    productCode: true,
    createdById: true,
    tracksBatches: true,
};

const ORDER_INCLUDE = {
    product: {
        select: {
            id: true,
            legacyMongoId: true,
            productName: true,
            productCode: true,
            createdById: true,
            tracksBatches: true,
        },
    },
    pointOfSale: { select: { id: true, name: true } },
    lines: {
        include: { componentProduct: { select: COMPONENT_SELECT } },
    },
};

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: {
            id: true,
            legacyMongoId: true,
            createdById: true,
            productName: true,
            productCode: true,
            isKit: true,
            isManufactured: true,
            tracksBatches: true,
            recipeComponents: {
                orderBy: { position: "asc" },
                select: {
                    componentProductId: true,
                    quantity: true,
                    componentProduct: { select: COMPONENT_SELECT },
                },
            },
        },
    });

const findOrderById = async (id) => prisma.productionOrder.findFirst({ where: { id }, include: ORDER_INCLUDE });

const mapOrder = (order) => ({
    _id: order.id,
    product_id: toExternalId(order.product),
    product_name: order.product.productName,
    product_code: order.product.productCode,
    point_of_sale_id: order.pointOfSaleId,
    point_of_sale_name: order.pointOfSale?.name,
    quantity: order.quantity,
    status: order.status,
    labor_cost: Number(order.laborCost),
    overhead_cost: Number(order.overheadCost),
    materials_cost: Number(order.materialsCost),
    unit_cost_applied: order.unitCostApplied === null ? null : Number(order.unitCostApplied),
    batch_number: order.batchNumber,
    batch_expiration_date: order.batchExpirationDate,
    notes: order.notes,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    lines: (order.lines || []).map((l) => ({
        product_id: toExternalId(l.componentProduct),
        product_name: l.componentProduct.productName,
        product_code: l.componentProduct.productCode,
        quantity_required: Number(l.quantityRequired),
        unit_cost_applied: l.unitCostApplied === null ? null : Number(l.unitCostApplied),
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
});

// pointOfSaleId is expected to already be resolved/validated by the caller
// (controller's resolveOrAssertPointOfSaleId), same convention
// purchase.service.js#createPurchase and order.service.js#createOrder use
// for their own pointOfSaleId parameter.
export const createProductionOrder = async ({ productId, pointOfSaleId, quantity, laborCost, overheadCost, batchNumber, batchExpirationDate, notes, userId, userRole }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
        throw new ApiError(400, "Quantity must be a positive integer");
    }

    const product = await findProductByAnyId(productId);
    if (!product) throw new ApiError(404, "Product not found", [], "", "product_not_found");
    if (userRole !== "admin" && product.createdById !== userId) {
        throw new ApiError(403, "You don't have permission to use this product");
    }
    if (!product.isManufactured) {
        throw new ApiError(400, "This product is not set up for manufacturing.", [], "", "product_not_manufactured");
    }
    if (product.recipeComponents.length === 0) {
        throw new ApiError(400, "This product has no recipe configured.", [], "", "product_recipe_components_required");
    }
    if (product.tracksBatches && !String(batchNumber || "").trim()) {
        throw new ApiError(400, "A lot/batch number is required for this product.", [], "", "product_batch_number_required");
    }

    const laborCostNum = laborCost !== undefined && laborCost !== null && laborCost !== "" ? Number(laborCost) : 0;
    const overheadCostNum = overheadCost !== undefined && overheadCost !== null && overheadCost !== "" ? Number(overheadCost) : 0;
    if (!Number.isFinite(laborCostNum) || laborCostNum < 0) throw new ApiError(400, "Labor cost must be non-negative");
    if (!Number.isFinite(overheadCostNum) || overheadCostNum < 0) throw new ApiError(400, "Overhead cost must be non-negative");

    const order = await prisma.productionOrder.create({
        data: {
            productId: product.id,
            pointOfSaleId,
            quantity: qty,
            laborCost: round2(laborCostNum),
            overheadCost: round2(overheadCostNum),
            ...(product.tracksBatches && {
                batchNumber: String(batchNumber).trim(),
                batchExpirationDate: batchExpirationDate ? new Date(batchExpirationDate) : null,
            }),
            notes: notes ? String(notes).trim() : null,
            createdById: userId,
            updatedById: userId,
            lines: {
                // Snapshot of the recipe scaled by `quantity`, rounded to a
                // whole unit the same way a kit sale rounds its own
                // per-component consumption (claimLocationStockWithCost
                // requires an integer quantity) - see
                // ProductionOrderLine's schema comment.
                create: product.recipeComponents.map((c) => ({
                    componentProductId: c.componentProductId,
                    quantityRequired: Math.round(qty * Number(c.quantity)),
                })),
            },
        },
        include: ORDER_INCLUDE,
    });

    emitPosEvent(userId, pointOfSaleId, "productionOrder", "created");
    return mapOrder(order);
};

export const listProductionOrders = async ({ accountId, status, productId, pointOfSaleId }) => {
    const orders = await prisma.productionOrder.findMany({
        where: {
            product: { createdById: accountId },
            ...(status ? { status } : {}),
            ...(productId ? { productId } : {}),
            ...(pointOfSaleId ? { pointOfSaleId } : {}),
        },
        include: ORDER_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    return orders.map(mapOrder);
};

export const getProductionOrder = async (accountId, id) => {
    const order = await findOrderById(id);
    if (!order || order.product.createdById !== accountId) {
        throw new ApiError(404, "Production order not found");
    }
    return mapOrder(order);
};

// draft -> completed: claims every recipe line's raw material at this
// location (FEFO-consuming its lots too, if it tracks them), then credits
// the finished product at (materials + labor + overhead) / quantity - see
// accountingPosting.service.js#postProductionJournalEntry for why only the
// labor/overhead portion ever needs a journal entry.
export const completeProductionOrder = async ({ orderId, userId, userRole, actingUser }) => {
    const order = await findOrderById(orderId);
    if (!order) throw new ApiError(404, "Production order not found");
    if (userRole !== "admin" && order.product.createdById !== userId) {
        throw new ApiError(403, "You don't have permission to update this production order");
    }
    if (actingUser) assertPosAccess(actingUser, order.pointOfSaleId);
    if (order.status !== "draft") {
        throw new ApiError(400, `Cannot complete an order in status "${order.status}"`, [], "", "invalid_production_status_transition");
    }

    // Defensive pre-check, same "real guard is the atomic per-line claim
    // inside the transaction" caveat as every other completion flow in
    // this codebase - this read predates the transaction and can't by
    // itself stop a concurrent claim on the same location's stock.
    const componentIds = [...new Set(order.lines.map((l) => l.componentProductId))];
    const locationRows = await prisma.productLocationStock.findMany({
        where: { pointOfSaleId: order.pointOfSaleId, productId: { in: componentIds } },
        select: { productId: true, stock: true },
    });
    const stockByProduct = new Map(locationRows.map((r) => [r.productId, r.stock]));
    const insufficientItems = order.lines
        .filter((l) => (stockByProduct.get(l.componentProductId) ?? 0) < Number(l.quantityRequired))
        .map((l) => ({
            product_id: toExternalId(l.componentProduct),
            product_name: l.componentProduct.productName,
            product_code: l.componentProduct.productCode,
            requested: Number(l.quantityRequired),
            available: stockByProduct.get(l.componentProductId) ?? 0,
            reason: "insufficient_stock",
        }));
    if (insufficientItems.length > 0) {
        throw new ApiError(422, "Insufficient stock for one or more raw materials", insufficientItems, "", "insufficient_stock");
    }

    const updated = await prisma.$transaction(async (tx) => {
        // Same guarded transition claim as every other completion flow -
        // see order.service.js/purchase.service.js's matching comment.
        const claim = await tx.productionOrder.updateMany({
            where: { id: order.id, status: "draft" },
            data: { status: "completed", updatedById: userId, completedAt: new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "This order was already updated by another request. Please refresh and try again.");
        }

        let materialsCost = 0;
        for (const line of order.lines) {
            const qty = Math.round(Number(line.quantityRequired));
            const costing = await claimLocationStockWithCost(tx, {
                productId: line.componentProductId,
                pointOfSaleId: order.pointOfSaleId,
                quantity: qty,
            });
            if (costing === null) {
                const available = await getLocationStock(line.componentProductId, order.pointOfSaleId);
                throw new ApiError(
                    422,
                    "Insufficient stock for one or more raw materials",
                    [
                        {
                            product_id: toExternalId(line.componentProduct),
                            product_name: line.componentProduct.productName,
                            product_code: line.componentProduct.productCode,
                            requested: qty,
                            available,
                            reason: "insufficient_stock",
                        },
                    ],
                    "",
                    "insufficient_stock"
                );
            }

            await recordStockMovement(tx, {
                productId: line.componentProductId,
                accountId: line.componentProduct.createdById,
                pointOfSaleId: order.pointOfSaleId,
                delta: -qty,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "production_consumption",
                sourceId: order.id,
                createdById: userId,
            });

            if (line.componentProduct.tracksBatches) {
                const batchClaim = await claimBatchesFEFO(tx, {
                    productId: line.componentProductId,
                    pointOfSaleId: order.pointOfSaleId,
                    quantity: qty,
                });
                if (batchClaim === null) {
                    throw new ApiError(422, "Insufficient lot/batch stock for one or more raw materials", [], "", "insufficient_stock");
                }
            }

            await tx.productionOrderLine.update({ where: { id: line.id }, data: { unitCostApplied: costing.unitCostApplied } });
            materialsCost += -costing.valueDelta;
        }

        materialsCost = round2(materialsCost);
        const totalCost = round2(materialsCost + Number(order.laborCost) + Number(order.overheadCost));
        const unitCostApplied = order.quantity > 0 ? Number((totalCost / order.quantity).toFixed(4)) : 0;

        const finishedCosting = await creditLocationStockWithCost(tx, {
            productId: order.productId,
            pointOfSaleId: order.pointOfSaleId,
            quantity: order.quantity,
            incomingUnitCost: unitCostApplied,
        });

        await recordStockMovement(tx, {
            productId: order.productId,
            accountId: order.product.createdById,
            pointOfSaleId: order.pointOfSaleId,
            delta: order.quantity,
            balanceAfter: finishedCosting.balanceAfter,
            unitCostApplied: finishedCosting.unitCostApplied,
            valueDelta: finishedCosting.valueDelta,
            valueBalanceAfter: finishedCosting.valueBalanceAfter,
            sourceType: "production_output",
            sourceId: order.id,
            createdById: userId,
        });

        if (order.product.tracksBatches) {
            await creditBatch(tx, {
                productId: order.productId,
                pointOfSaleId: order.pointOfSaleId,
                batchNumber: order.batchNumber,
                expirationDate: order.batchExpirationDate,
                quantity: order.quantity,
                createdById: userId,
            });
        }

        await tx.productionOrder.update({ where: { id: order.id }, data: { materialsCost, unitCostApplied } });

        await postProductionJournalEntry(tx, {
            accountId: order.product.createdById,
            createdById: userId,
            order: { id: order.id, quantity: order.quantity, laborCost: order.laborCost, overheadCost: order.overheadCost, pointOfSaleId: order.pointOfSaleId },
        });

        return tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
    });

    emitPosEvent(order.product.createdById, order.pointOfSaleId, "productionOrder", "completed");
    emitPosEvent(order.product.createdById, order.pointOfSaleId, "product", "stock-changed");
    return mapOrder(updated);
};

// A draft cancels with zero stock/accounting effect (nothing happened
// yet). A completed order reverses fully: claims the produced quantity
// back (fails if it's no longer fully on hand - already sold,
// transferred, or consumed by a later order), credits every raw material
// back at exactly the cost it was consumed at, and reverses the journal
// entry if one was posted.
export const cancelProductionOrder = async ({ orderId, userId, userRole, actingUser, reason }) => {
    const order = await findOrderById(orderId);
    if (!order) throw new ApiError(404, "Production order not found");
    if (userRole !== "admin" && order.product.createdById !== userId) {
        throw new ApiError(403, "You don't have permission to update this production order");
    }
    if (actingUser) assertPosAccess(actingUser, order.pointOfSaleId);
    if (!["draft", "completed"].includes(order.status)) {
        throw new ApiError(400, `Cannot cancel an order in status "${order.status}"`, [], "", "invalid_production_status_transition");
    }

    if (order.status === "draft") {
        const claim = await prisma.productionOrder.updateMany({
            where: { id: order.id, status: "draft" },
            data: { status: "cancelled", updatedById: userId, cancelledAt: new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "This order was already updated by another request. Please refresh and try again.");
        }
        emitPosEvent(order.product.createdById, order.pointOfSaleId, "productionOrder", "cancelled");
        return mapOrder(await findOrderById(order.id));
    }

    const reasonText = reason ? String(reason).trim() : "sin motivo especificado";

    const updated = await prisma.$transaction(async (tx) => {
        const claim = await tx.productionOrder.updateMany({
            where: { id: order.id, status: "completed" },
            data: { status: "cancelled", updatedById: userId, cancelledAt: new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "This order was already updated by another request. Please refresh and try again.");
        }

        const finishedClaim = await claimLocationStockWithCost(tx, {
            productId: order.productId,
            pointOfSaleId: order.pointOfSaleId,
            quantity: order.quantity,
        });
        if (finishedClaim === null) {
            throw new ApiError(
                409,
                "This production run's output is no longer fully on hand (sold, transferred, or otherwise consumed) - it can't be reversed.",
                [],
                "",
                "production_output_not_available"
            );
        }
        await recordStockMovement(tx, {
            productId: order.productId,
            accountId: order.product.createdById,
            pointOfSaleId: order.pointOfSaleId,
            delta: -order.quantity,
            balanceAfter: finishedClaim.balanceAfter,
            unitCostApplied: finishedClaim.unitCostApplied,
            valueDelta: finishedClaim.valueDelta,
            valueBalanceAfter: finishedClaim.valueBalanceAfter,
            sourceType: "production_reversal",
            sourceId: order.id,
            reason: `Reversión de producción: ${reasonText}`,
            createdById: userId,
        });

        if (order.product.tracksBatches) {
            const batchClaim = await claimNamedBatch(tx, {
                productId: order.productId,
                pointOfSaleId: order.pointOfSaleId,
                batchNumber: order.batchNumber,
                quantity: order.quantity,
            });
            if (batchClaim === null) {
                throw new ApiError(409, "El lote producido ya no tiene suficiente cantidad disponible para revertir.", [], "", "production_output_not_available");
            }
        }

        for (const line of order.lines) {
            const qty = Math.round(Number(line.quantityRequired));
            const costing = await creditLocationStockWithCost(tx, {
                productId: line.componentProductId,
                pointOfSaleId: order.pointOfSaleId,
                quantity: qty,
                incomingUnitCost: line.unitCostApplied !== null ? Number(line.unitCostApplied) : undefined,
            });
            await recordStockMovement(tx, {
                productId: line.componentProductId,
                accountId: line.componentProduct.createdById,
                pointOfSaleId: order.pointOfSaleId,
                delta: qty,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "production_reversal",
                sourceId: order.id,
                reason: `Reversión de producción: ${reasonText}`,
                createdById: userId,
            });

            if (line.componentProduct.tracksBatches) {
                await creditBatchReturn(tx, {
                    productId: line.componentProductId,
                    pointOfSaleId: order.pointOfSaleId,
                    quantity: qty,
                    createdById: userId,
                });
            }
        }

        await postProductionReversalJournalEntry(tx, {
            accountId: order.product.createdById,
            createdById: userId,
            order: { id: order.id, quantity: order.quantity, laborCost: order.laborCost, overheadCost: order.overheadCost, pointOfSaleId: order.pointOfSaleId },
        });

        return tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
    });

    emitPosEvent(order.product.createdById, order.pointOfSaleId, "productionOrder", "cancelled");
    emitPosEvent(order.product.createdById, order.pointOfSaleId, "product", "stock-changed");
    return mapOrder(updated);
};
