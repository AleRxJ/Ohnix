// Single write path for stock_movements - every place that mutates
// Product.stock (purchase completion, sale completion, purchase return,
// sale cancellation, manual adjustment) must call this from inside the same
// transaction that changes the stock, so the ledger and the live balance
// can never drift apart.
export const recordStockMovement = (
    tx,
    { productId, accountId, pointOfSaleId, variantId, delta, balanceAfter, unitCostApplied, valueDelta, valueBalanceAfter, sourceType, sourceId, reason, createdById }
) =>
    tx.stockMovement.create({
        data: {
            productId,
            accountId,
            pointOfSaleId,
            variantId: variantId ?? null,
            delta,
            balanceAfter,
            unitCostApplied: unitCostApplied ?? null,
            valueDelta: valueDelta ?? null,
            valueBalanceAfter: valueBalanceAfter ?? null,
            sourceType,
            sourceId: sourceId ?? null,
            reason: reason ?? null,
            createdById,
        },
    });
