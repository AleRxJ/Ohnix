ALTER TABLE "products" ADD COLUMN "tracks_batches" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "purchase_details" ADD COLUMN "batch_number" TEXT;
ALTER TABLE "purchase_details" ADD COLUMN "batch_expiration_date" TIMESTAMP(3);

ALTER TABLE "stock_transfers" ADD COLUMN "batch_allocations" JSONB;

CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_batches_product_id_point_of_sale_id_batch_number_key" ON "product_batches"("product_id", "point_of_sale_id", "batch_number");
CREATE INDEX "product_batches_product_id_point_of_sale_id_expiration_dat_idx" ON "product_batches"("product_id", "point_of_sale_id", "expiration_date");

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
