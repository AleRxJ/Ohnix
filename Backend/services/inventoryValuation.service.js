import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Kardex valorizado vs. cuenta 1435. StockMovement already carries the
// weighted-average costing of every in/out (unitCostApplied, valueDelta,
// valueBalanceAfter - see productLocationStock.service.js), per (product,
// location). The inventory value at a date is therefore the last movement's
// valueBalanceAfter for each pair, which is what gets compared against the
// ledger. Movements from before per-location costing existed have null
// value columns; those pairs are flagged instead of silently valued at 0.

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const parseDate = (value, code, fallback) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "The date is invalid.", [], "", code);
    return date;
};

// Last movement per (product, location) on or before `asOf`.
const lastBalances = (accountId, asOf, productId = null) => prisma.$queryRaw`
    SELECT DISTINCT ON (sm.product_id, sm.point_of_sale_id)
        sm.product_id AS "productId",
        sm.point_of_sale_id AS "pointOfSaleId",
        sm.balance_after AS "quantity",
        sm.value_balance_after AS "value"
    FROM stock_movements sm
    WHERE sm.account_id = ${accountId}
      AND sm.created_at <= ${asOf}
      AND (${productId}::text IS NULL OR sm.product_id = ${productId})
    ORDER BY sm.product_id, sm.point_of_sale_id, sm.created_at DESC, sm.id DESC
`;

export const summarizeValuation = (balances) => {
    const byProduct = new Map();
    for (const row of balances) {
        const current = byProduct.get(row.productId) || { productId: row.productId, quantity: 0, value: 0, unvalued: false };
        current.quantity += Number(row.quantity);
        if (row.value === null || row.value === undefined) {
            if (Number(row.quantity) !== 0) current.unvalued = true;
        } else {
            current.value = round2(current.value + Number(row.value));
        }
        byProduct.set(row.productId, current);
    }
    return [...byProduct.values()];
};

export const getInventoryValuation = async ({ accountId, asOf }) => {
    const asOfDate = parseDate(asOf, "inventory_valuation_date_invalid", new Date());
    const [balances, inventoryAccount] = await Promise.all([
        lastBalances(accountId, asOfDate),
        prisma.chartAccount.findFirst({ where: { createdById: accountId, code: "1435" }, select: { id: true } }),
    ]);
    const products = summarizeValuation(balances).filter((row) => row.quantity !== 0 || row.value !== 0);
    const details = products.length
        ? await prisma.product.findMany({ where: { id: { in: products.map((p) => p.productId) } }, select: { id: true, productName: true, productCode: true } })
        : [];
    const byId = new Map(details.map((p) => [p.id, p]));
    let ledgerBalance = 0;
    if (inventoryAccount) {
        const agg = await prisma.journalEntryLine.aggregate({ where: { chartAccountId: inventoryAccount.id, journalEntry: { entryDate: { lte: asOfDate } } }, _sum: { debit: true, credit: true } });
        ledgerBalance = round2(Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0));
    }
    const inventoryValue = round2(products.reduce((sum, row) => sum + row.value, 0));
    return {
        as_of: asOfDate,
        inventory_value: inventoryValue,
        ledger_balance: ledgerBalance,
        difference: round2(ledgerBalance - inventoryValue),
        unvalued_products: products.filter((row) => row.unvalued).length,
        products: products
            .map((row) => ({ product_id: row.productId, code: byId.get(row.productId)?.productCode || null, name: byId.get(row.productId)?.productName || row.productId, quantity: row.quantity, value: row.value, average_cost: row.quantity > 0 ? round2(row.value / row.quantity) : 0, unvalued: row.unvalued }))
            .sort((a, b) => b.value - a.value),
    };
};

// Kardex of one product across (or within) locations: opening balance at
// `from`, every movement in range, and the running quantity/value.
export const buildKardexRows = ({ opening, movements }) => {
    let quantity = opening.quantity;
    let value = opening.value;
    return movements.map((m) => {
        const delta = Number(m.delta);
        const valueDelta = m.valueDelta === null || m.valueDelta === undefined ? null : Number(m.valueDelta);
        quantity += delta;
        value = round2(value + (valueDelta || 0));
        return {
            id: m.id,
            date: m.createdAt,
            source_type: m.sourceType,
            source_id: m.sourceId,
            reason: m.reason,
            point_of_sale: m.pointOfSale ? { _id: m.pointOfSale.id, name: m.pointOfSale.name } : null,
            quantity_in: delta > 0 ? delta : 0,
            quantity_out: delta < 0 ? -delta : 0,
            unit_cost: m.unitCostApplied === null || m.unitCostApplied === undefined ? null : Number(m.unitCostApplied),
            value_delta: valueDelta,
            balance_quantity: quantity,
            balance_value: value,
        };
    });
};

export const getProductKardex = async ({ accountId, productId, from, to, pointOfSaleId }) => {
    const product = await prisma.product.findFirst({ where: { id: productId, createdById: accountId }, select: { id: true, productName: true, productCode: true } });
    if (!product) throw new ApiError(404, "Product not found.", [], "", "inventory_valuation_product_not_found");
    const toDate = parseDate(to, "inventory_valuation_date_invalid", new Date());
    const fromDate = parseDate(from, "inventory_valuation_date_invalid", new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1)));
    const beforeFrom = new Date(fromDate.getTime() - 1);
    const openingRows = (await lastBalances(accountId, beforeFrom, productId)).filter((row) => !pointOfSaleId || row.pointOfSaleId === pointOfSaleId);
    const opening = { quantity: openingRows.reduce((s, r) => s + Number(r.quantity), 0), value: round2(openingRows.reduce((s, r) => s + Number(r.value || 0), 0)) };
    const movements = await prisma.stockMovement.findMany({
        where: { accountId, productId, createdAt: { gte: fromDate, lte: toDate }, ...(pointOfSaleId ? { pointOfSaleId } : {}) },
        include: { pointOfSale: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 5000,
    });
    const rows = buildKardexRows({ opening, movements });
    const last = rows[rows.length - 1];
    return {
        product: { _id: product.id, name: product.productName, code: product.productCode },
        from: fromDate,
        to: toDate,
        opening_quantity: opening.quantity,
        opening_value: opening.value,
        closing_quantity: last ? last.balance_quantity : opening.quantity,
        closing_value: last ? last.balance_value : opening.value,
        total_in: rows.reduce((s, r) => s + r.quantity_in, 0),
        total_out: rows.reduce((s, r) => s + r.quantity_out, 0),
        rows,
    };
};
