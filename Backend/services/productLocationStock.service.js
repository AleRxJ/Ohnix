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
const money = (value) => Number(Number(value).toFixed(2));
const unitCost = (value) => Number(Number(value).toFixed(4));

export const calculateWeightedAverageCost = ({ currentQuantity, currentValue, incomingQuantity, incomingUnitCost }) => {
    const quantity = Number(currentQuantity) + Number(incomingQuantity);
    const value = money(Number(currentValue) + Number(incomingQuantity) * Number(incomingUnitCost));
    return { quantity, value, averageUnitCost: quantity > 0 ? unitCost(value / quantity) : 0 };
};

const lockLocationRow = async (tx, productId, pointOfSaleId) => {
    await tx.productLocationStock.upsert({
        where: { productId_pointOfSaleId: { productId, pointOfSaleId } },
        create: { productId, pointOfSaleId, stock: 0, averageUnitCost: 0, inventoryValue: 0 },
        update: {},
    });
    const rows = await tx.$queryRaw`
        SELECT id, stock, average_unit_cost, inventory_value
        FROM product_location_stock
        WHERE product_id = ${productId} AND point_of_sale_id = ${pointOfSaleId}
        FOR UPDATE
    `;
    return rows[0];
};

export const claimLocationStockWithCost = async (tx, { productId, pointOfSaleId, quantity }) => {
    const qty = Number(quantity);
    const row = await lockLocationRow(tx, productId, pointOfSaleId);
    if (!Number.isInteger(qty) || qty <= 0 || Number(row.stock) < qty) return null;

    const oldStock = Number(row.stock);
    const oldValue = Number(row.inventory_value);
    const appliedUnitCost = unitCost(row.average_unit_cost);
    const costAmount = qty === oldStock ? money(oldValue) : money(qty * appliedUnitCost);
    const balanceAfter = oldStock - qty;
    const valueBalanceAfter = balanceAfter === 0 ? 0 : money(Math.max(oldValue - costAmount, 0));
    const averageUnitCost = balanceAfter === 0 ? 0 : unitCost(valueBalanceAfter / balanceAfter);

    await tx.productLocationStock.update({
        where: { id: row.id },
        data: { stock: balanceAfter, inventoryValue: valueBalanceAfter, averageUnitCost },
    });
    await tx.product.update({ where: { id: productId }, data: { stock: { decrement: qty } } });

    return { balanceAfter, unitCostApplied: appliedUnitCost, valueDelta: -costAmount, valueBalanceAfter };
};

export const claimLocationStock = async (tx, args) => {
    const result = await claimLocationStockWithCost(tx, args);
    return result?.balanceAfter ?? null;
};

// Adds `quantity` units at one location (purchases, returns, credit-note
// restocks, positive adjustments) - never fails, upserts the location's
// row on first use.
export const creditLocationStockWithCost = async (tx, { productId, pointOfSaleId, quantity, incomingUnitCost }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(400, "Inventory credit quantity must be a positive integer");

    let appliedCost = incomingUnitCost;
    if (appliedCost === undefined || appliedCost === null) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { buyingPrice: true } });
        appliedCost = Number(product.buyingPrice);
    }
    appliedCost = unitCost(appliedCost);
    if (!Number.isFinite(appliedCost) || appliedCost < 0) throw new ApiError(400, "Inventory unit cost must be non-negative");

    const row = await lockLocationRow(tx, productId, pointOfSaleId);
    const next = calculateWeightedAverageCost({
        currentQuantity: Number(row.stock),
        currentValue: Number(row.inventory_value),
        incomingQuantity: qty,
        incomingUnitCost: appliedCost,
    });
    await tx.productLocationStock.update({
        where: { id: row.id },
        data: { stock: next.quantity, inventoryValue: next.value, averageUnitCost: next.averageUnitCost },
    });
    await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });

    return { balanceAfter: next.quantity, unitCostApplied: appliedCost, valueDelta: money(qty * appliedCost), valueBalanceAfter: next.value, averageUnitCost: next.averageUnitCost };
};

export const creditLocationStock = async (tx, args) => {
    const result = await creditLocationStockWithCost(tx, args);
    return result.balanceAfter;
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

// What can actually be SOLD from one location right now - the same rule
// order.service.js#createOrder enforces: a plain product needs its own
// ProductLocationStock there; a kit is limited by its scarcest component
// there. Used by the Caja (GET /products?point_of_sale_id=...), which must
// never offer units the checkout would then reject. `products` need
// `isKit` and `kitComponents` ({ componentProductId, quantity }).
export const sellableStockAtLocation = async (products, pointOfSaleId) => {
    const ids = new Set();
    for (const p of products) {
        if (p.isKit) (p.kitComponents || []).forEach((c) => ids.add(c.componentProductId));
        else ids.add(p.id);
    }
    const rows = ids.size
        ? await prisma.productLocationStock.findMany({
              where: { pointOfSaleId, productId: { in: [...ids] } },
              select: { productId: true, stock: true },
          })
        : [];
    const byId = new Map(rows.map((row) => [row.productId, row.stock]));
    return new Map(
        products.map((p) => {
            if (!p.isKit) return [p.id, Math.max(0, byId.get(p.id) ?? 0)];
            const components = p.kitComponents || [];
            if (!components.length) return [p.id, 0];
            return [p.id, Math.max(0, Math.min(...components.map((c) => Math.floor((byId.get(c.componentProductId) ?? 0) / Number(c.quantity)))))];
        })
    );
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
