import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";

// The per-location counterpart to Product.stock (see the model comment in
// schema.prisma). Every write path that used to guard a decrement with
// `tx.product.updateMany({ where: { stock: { gte } } })` now claims at the
// (product, location) level instead - that's the real bound on
// availability once an account has more than one Point of Sale. Product.
// stock is still updated in the same transaction (unconditionally, since
// the location-level claim already proved the operation is valid), purely
// as the fast-read account-wide total other code still reads directly
// (dashboards, low-stock alerts, exports) - none of that needed to change
// to understand "how much of this product does the account have".

// Atomically claims `quantity` units at one location - same idiom as
// before, just against ProductLocationStock instead of Product. Returns
// the location's new balance on success, or null on failure (never
// throws), so each call site keeps its own existing error message/shape
// instead of a generic one here. A missing row claims as "0 available",
// which is correct: a location that's never received this product has
// nothing to sell/adjust away.
export const claimLocationStock = async (tx, { productId, pointOfSaleId, quantity }) => {
    const claim = await tx.productLocationStock.updateMany({
        where: { productId, pointOfSaleId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
    });
    if (claim.count === 0) return null;

    await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: quantity } },
    });

    const row = await tx.productLocationStock.findUniqueOrThrow({
        where: { productId_pointOfSaleId: { productId, pointOfSaleId } },
        select: { stock: true },
    });
    return row.stock;
};

// Adds `quantity` units at one location (purchases, returns, credit-note
// restocks, positive adjustments) - never fails, upserts the location's
// row on first use.
export const creditLocationStock = async (tx, { productId, pointOfSaleId, quantity }) => {
    const row = await tx.productLocationStock.upsert({
        where: { productId_pointOfSaleId: { productId, pointOfSaleId } },
        create: { productId, pointOfSaleId, stock: quantity },
        update: { stock: { increment: quantity } },
    });

    await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: quantity } },
    });

    return row.stock;
};

export const getLocationStock = async (productId, pointOfSaleId) => {
    const row = await prisma.productLocationStock.findUnique({
        where: { productId_pointOfSaleId: { productId, pointOfSaleId } },
        select: { stock: true },
    });
    return row?.stock ?? 0;
};

export const listLocationStockForProduct = async (productId) =>
    prisma.productLocationStock.findMany({
        where: { productId },
        include: { pointOfSale: { select: { id: true, name: true, isDefault: true, isActive: true } } },
        orderBy: [{ pointOfSale: { isDefault: "desc" } }, { pointOfSale: { name: "asc" } }],
    });

// Moves `quantity` units of one product from one Point of Sale to another
// within the same account, in a single transaction - never a bare
// decrement + a separate increment, so a failure partway through can never
// leave stock deducted from the source without ever landing at the
// destination (see the architecture audit's "inventario compartido"
// section). Product.stock (the account-wide total) is untouched: the
// total doesn't change, only where it sits.
export const transferStock = async ({ accountId, actorId, productId, fromPointOfSaleId, toPointOfSaleId, quantity, reason }) => {
    if (fromPointOfSaleId === toPointOfSaleId) {
        throw new ApiError(400, "El punto de venta de origen y destino no pueden ser el mismo.");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, "La cantidad a transferir debe ser un entero positivo.");
    }

    const [product, fromPos, toPos] = await Promise.all([
        prisma.product.findFirst({ where: { id: productId, createdById: accountId }, select: { id: true } }),
        prisma.pointOfSale.findFirst({ where: { id: fromPointOfSaleId, accountId, isActive: true }, select: { id: true } }),
        prisma.pointOfSale.findFirst({ where: { id: toPointOfSaleId, accountId, isActive: true }, select: { id: true } }),
    ]);
    if (!product) throw new ApiError(404, "Producto no encontrado.");
    if (!fromPos || !toPos) throw new ApiError(404, "Punto de venta no encontrado.");

    // One synthetic id ties the two ledger rows (transfer_out at the
    // source, transfer_in at the destination) together as the same event -
    // there's no separate StockTransfer table, this is the only record.
    const transferId = `xfer_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    return prisma.$transaction(async (tx) => {
        const fromBalance = await claimLocationStock(tx, { productId, pointOfSaleId: fromPointOfSaleId, quantity });
        if (fromBalance === null) {
            const available = await getLocationStock(productId, fromPointOfSaleId);
            throw new ApiError(
                422,
                `Stock insuficiente en el punto de venta de origen (disponible: ${available}, solicitado: ${quantity}).`
            );
        }

        const toBalance = await creditLocationStock(tx, { productId, pointOfSaleId: toPointOfSaleId, quantity });

        // Product.stock was decremented and incremented once each by the
        // two calls above - net zero, as it should be for a transfer
        // between two locations of the same account. Re-read it once so
        // recordStockMovement's balanceAfter (which mirrors Product.stock
        // for every other movement type) stays meaningful here too.
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });

        await recordStockMovement(tx, {
            productId,
            accountId,
            pointOfSaleId: fromPointOfSaleId,
            delta: -quantity,
            balanceAfter: product.stock,
            sourceType: "transfer_out",
            sourceId: transferId,
            reason: reason ?? null,
            createdById: actorId,
        });
        await recordStockMovement(tx, {
            productId,
            accountId,
            pointOfSaleId: toPointOfSaleId,
            delta: quantity,
            balanceAfter: product.stock,
            sourceType: "transfer_in",
            sourceId: transferId,
            reason: reason ?? null,
            createdById: actorId,
        });

        return { transferId, fromBalance, toBalance, productStock: product.stock };
    });
};
