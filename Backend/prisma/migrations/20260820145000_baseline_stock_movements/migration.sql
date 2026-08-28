-- Baseline catch-up: "stock_movements" and the "StockMovementSourceType"
-- enum exist in the real database but were never captured by any tracked
-- migration - same root cause as 20260803000000_baseline. Reconstructed from
-- the schema.prisma state immediately before this table/enum's first
-- migration reference (20260820150000_order_return_granular, which ALTERs
-- the enum), at commit f900e11~1. Metadata-only for local shadow-database
-- replay - never run against the real database, which already has these.
CREATE TYPE "StockMovementSourceType" AS ENUM ('purchase', 'purchase_return', 'order', 'order_cancellation', 'adjustment');

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "source_type" "StockMovementSourceType" NOT NULL,
    "source_id" TEXT,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

CREATE INDEX "stock_movements_account_id_created_at_idx" ON "stock_movements"("account_id", "created_at");

CREATE INDEX "stock_movements_source_type_source_id_idx" ON "stock_movements"("source_type", "source_id");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
