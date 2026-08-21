-- Multi-location inventory workflow (2026-08-21 spec): full request/
-- approve/ship/receive/cancel lifecycle for moving stock between two of an
-- account's locations, plus a generic locationType so a PointOfSale row
-- can represent a warehouse or distribution center, not just a retail
-- counter. Both changes are purely additive - a brand-new table and a
-- column with its own DEFAULT for every existing row - so unlike the two
-- earlier point-of-sale migrations, this one needs no hand-written
-- backfill; the raw output of `prisma migrate diff` is used verbatim.

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('requested', 'approved', 'in_transit', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('point_of_sale', 'warehouse', 'distribution_center');

-- AlterTable
ALTER TABLE "points_of_sale" ADD COLUMN     "location_type" "LocationType" NOT NULL DEFAULT 'point_of_sale';

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "from_point_of_sale_id" TEXT NOT NULL,
    "to_point_of_sale_id" TEXT NOT NULL,
    "quantity_sent" INTEGER NOT NULL,
    "quantity_received" INTEGER,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'requested',
    "is_quick_transfer" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "cancel_reason" TEXT,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "sent_by" TEXT,
    "sent_at" TIMESTAMP(3),
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_account_id_status_idx" ON "stock_transfers"("account_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_product_id_idx" ON "stock_transfers"("product_id");

-- CreateIndex
CREATE INDEX "stock_transfers_from_point_of_sale_id_status_idx" ON "stock_transfers"("from_point_of_sale_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_to_point_of_sale_id_status_idx" ON "stock_transfers"("to_point_of_sale_id", "status");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_point_of_sale_id_fkey" FOREIGN KEY ("from_point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_point_of_sale_id_fkey" FOREIGN KEY ("to_point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

