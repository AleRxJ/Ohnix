import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// The per-(product, location, lot) sub-ledger behind a tracksBatches
// product - see ProductBatch's schema comment for why it only tracks
// quantity/expiration and leaves cost entirely to
// productLocationStock.service.js's weighted average.

// Row-locks every non-empty lot for one (product, location) pair in FEFO
// order (earliest expiration first, lots with no expiration last, then
// oldest-received first) - same guarded-row idiom as
// productLocationStock.service.js#lockLocationRow, just over N rows
// instead of 1, since a single claim can span more than one lot.
const lockBatchRowsFEFO = async (tx, productId, pointOfSaleId) =>
    tx.$queryRaw`
        SELECT id, batch_number, expiration_date, quantity
        FROM product_batches
        WHERE product_id = ${productId} AND point_of_sale_id = ${pointOfSaleId} AND quantity > 0
        ORDER BY expiration_date ASC NULLS LAST, created_at ASC
        FOR UPDATE
    `;

// Adds `quantity` units to one named lot at one location, creating it on
// first use - purchases, positive adjustments, and inbound transfers all
// go through this. A lot's expiration is only ever set once: a repeat
// receipt of the same lot number with a different date is a data-entry
// question for the caller, not something this silently overwrites.
export const creditBatch = async (tx, { productId, pointOfSaleId, batchNumber, expirationDate, quantity, createdById }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(400, "Batch credit quantity must be a positive integer");
    const trimmedNumber = String(batchNumber || "").trim().slice(0, 60);
    if (!trimmedNumber) throw new ApiError(400, "A lot/batch number is required for this product.", [], "", "product_batch_number_required");

    const existing = await tx.productBatch.findUnique({
        where: { productId_pointOfSaleId_batchNumber: { productId, pointOfSaleId, batchNumber: trimmedNumber } },
    });

    if (existing) {
        return tx.productBatch.update({
            where: { id: existing.id },
            data: {
                quantity: { increment: qty },
                ...(existing.expirationDate === null && expirationDate ? { expirationDate: new Date(expirationDate) } : {}),
            },
        });
    }

    return tx.productBatch.create({
        data: {
            productId,
            pointOfSaleId,
            batchNumber: trimmedNumber,
            expirationDate: expirationDate ? new Date(expirationDate) : null,
            quantity: qty,
            createdById,
        },
    });
};

// Consumes `quantity` units across this (product, location)'s lots in FEFO
// order - sales, negative adjustments, outbound transfers, and quick
// transfers all go through this. Returns the per-lot breakdown consumed (a
// transfer needs it, to recreate the same lot identity at the destination
// location; everything else ignores it), or null if the location's lots
// don't add up to `quantity` - which per the ProductLocationStock invariant
// should never happen for a tracksBatches product, but this stays a guard
// rather than an assumption, exactly like claimLocationStockWithCost's own
// "never trust the pre-transaction read" comment.
export const claimBatchesFEFO = async (tx, { productId, pointOfSaleId, quantity }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return null;

    const rows = await lockBatchRowsFEFO(tx, productId, pointOfSaleId);
    let remaining = qty;
    const consumed = [];
    for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(row.quantity));
        if (take <= 0) continue;
        await tx.productBatch.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
        consumed.push({ batchNumber: row.batch_number, expirationDate: row.expiration_date, quantity: take });
        remaining -= take;
    }

    if (remaining > 0) return null;
    return consumed;
};

// Decrements exactly one named lot - used only by purchase returns, where
// the line being returned already identifies which lot it received (see
// PurchaseDetail.batchNumber), so returning it should give back that exact
// lot rather than whatever FEFO would pick. Returns null if that lot
// doesn't have enough left (e.g. some of it already sold), same
// never-throws idiom as every other claim function here.
export const claimNamedBatch = async (tx, { productId, pointOfSaleId, batchNumber, quantity }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return null;
    const trimmedNumber = String(batchNumber || "").trim();
    if (!trimmedNumber) return null;

    const rows = await tx.$queryRaw`
        SELECT id, quantity FROM product_batches
        WHERE product_id = ${productId} AND point_of_sale_id = ${pointOfSaleId} AND batch_number = ${trimmedNumber}
        FOR UPDATE
    `;
    const row = rows[0];
    if (!row || Number(row.quantity) < qty) return null;

    await tx.productBatch.update({ where: { id: row.id }, data: { quantity: { decrement: qty } } });
    return { quantity: qty };
};

// Restores `quantity` units after a sale/adjustment reversal - not a
// snapshot-accurate undo (see ProductBatch's schema comment), just credits
// the soonest-expiring lot that already exists, so the stock re-enters the
// same FEFO queue future sales will drain it from. Falls back to a
// dateless "SIN-LOTE" lot only if the product/location genuinely has none
// yet (it shouldn't - tracksBatches can't be turned on with existing stock -
// but a defensive fallback beats a thrown error on a return).
export const creditBatchReturn = async (tx, { productId, pointOfSaleId, quantity, createdById }) => {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return;

    const target = await tx.productBatch.findFirst({
        where: { productId, pointOfSaleId },
        orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
    });

    if (target) {
        await tx.productBatch.update({ where: { id: target.id }, data: { quantity: { increment: qty } } });
        return;
    }

    await creditBatch(tx, { productId, pointOfSaleId, batchNumber: "SIN-LOTE", expirationDate: null, quantity: qty, createdById });
};

// Every non-empty lot the account can see, soonest-expiring first (dateless
// lots last) - powers both the per-product "Lotes" drawer (productId set)
// and the account-wide expiration alert list (expiresWithinDays set,
// productId omitted).
export const listBatches = async ({ accountId, productId, pointOfSaleId, expiresWithinDays }) => {
    const where = {
        product: { createdById: accountId },
        quantity: { gt: 0 },
        ...(productId ? { productId } : {}),
        ...(pointOfSaleId ? { pointOfSaleId } : {}),
        ...(Number.isFinite(expiresWithinDays)
            ? { expirationDate: { not: null, lte: new Date(Date.now() + expiresWithinDays * 86400000) } }
            : {}),
    };

    return prisma.productBatch.findMany({
        where,
        select: {
            id: true,
            batchNumber: true,
            expirationDate: true,
            quantity: true,
            product: { select: { id: true, legacyMongoId: true, productName: true, productCode: true } },
            pointOfSale: { select: { id: true, name: true } },
        },
        orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
        take: 500,
    });
};
