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

// The "stock" figure shown outside the location-breakdown UI (product
// list/table, single-product responses) used to always be Product.stock -
// the account-wide cache. Correct for a full-scope actor (owner, admin,
// posScopeAll), but a restricted-scope member would see every other
// location's stock folded into that one number, which is exactly the leak
// the 2026-08-21 scoping pass was supposed to close for everything except
// the shared catalog itself (name/price/category stay account-wide on
// purpose - see that conversation - only the quantity is scoped). Returns
// `null` for a full-scope actor as a signal to the caller "use
// product.stock as-is", so the common case (most accounts still have one
// location) never pays for the extra aggregation query.
export const scopedStockForProducts = async (user, productIds) => {
    if (user.role === "admin" || user.posScopeAll) return null;
    if (!productIds.length) return new Map();

    const scopeIds = user.posScopeIds || [];
    if (!scopeIds.length) return new Map(productIds.map((id) => [id, 0]));

    const rows = await prisma.productLocationStock.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, pointOfSaleId: { in: scopeIds } },
        _sum: { stock: true },
    });

    const map = new Map(rows.map((row) => [row.productId, row._sum.stock || 0]));
    for (const id of productIds) {
        if (!map.has(id)) map.set(id, 0);
    }
    return map;
};

// Full per-location breakdown for one product - available (this table),
// inTransit (computed live from StockTransfer, never stored - see that
// model's comment for why a separate counter would risk drifting from the
// transfers that actually produced it), and their sum. Matches the
// "Punto A: 12 disponible / 0 en tránsito / 12 total" shape from the
// 2026-08-21 multi-location inventory spec, plus a grand-total row.
// Restricted-scope actors get only the locations in their own scope - see
// the `visibleLocationIds` param, populated by the controller from
// req.user.posScope*.
export const getLocationStockSummary = async (productId, accountId, visibleLocationIds = null) => {
    const [locations, inTransitRows] = await Promise.all([
        prisma.pointOfSale.findMany({
            where: {
                accountId,
                ...(visibleLocationIds ? { id: { in: visibleLocationIds } } : {}),
            },
            include: { locationStock: { where: { productId }, select: { stock: true } } },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
        prisma.stockTransfer.groupBy({
            by: ["toPointOfSaleId"],
            where: { productId, status: "in_transit" },
            _sum: { quantitySent: true },
        }),
    ]);

    const inTransitByLocation = new Map(inTransitRows.map((row) => [row.toPointOfSaleId, row._sum.quantitySent || 0]));

    const rows = locations.map((pos) => {
        const available = pos.locationStock[0]?.stock ?? 0;
        const inTransit = inTransitByLocation.get(pos.id) || 0;
        return {
            pointOfSaleId: pos.id,
            name: pos.name,
            locationType: pos.locationType,
            isDefault: pos.isDefault,
            isActive: pos.isActive,
            available,
            inTransit,
            total: available + inTransit,
        };
    });

    const totals = rows.reduce(
        (acc, row) => ({
            available: acc.available + row.available,
            inTransit: acc.inTransit + row.inTransit,
            total: acc.total + row.total,
        }),
        { available: 0, inTransit: 0, total: 0 }
    );

    return { locations: rows, totals };
};
