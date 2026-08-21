-- Mirrors 20260820140000_purchase_return_granular for the sales side: order
-- returns become an explicit, repeatable per-line action (see
-- order.service.js#processReturn) instead of the only existing "undo a sale"
-- path, full cancellation. "returned" is reached only as a side effect of
-- that method once every OrderDetail line has nothing left pending - never a
-- client-settable transition target (see order.service.js#updateOrderStatus).
ALTER TYPE "OrderStatus" ADD VALUE 'returned';

-- New stock-movement origin for a granular sales return, distinct from the
-- pre-existing "order_cancellation" (a full-order void, still used by
-- updateOrderStatus's completed -> cancelled branch).
ALTER TYPE "StockMovementSourceType" ADD VALUE 'order_return';

-- Running totals across every partial return event for a sold line - same
-- shape as purchase_details.returned_quantity/refund_amount/return_date.
ALTER TABLE "order_details" ADD COLUMN "return_date" TIMESTAMP(3);
ALTER TABLE "order_details" ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_details" ADD COLUMN "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
