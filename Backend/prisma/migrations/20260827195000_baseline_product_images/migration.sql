-- Baseline catch-up: "product_images" exists in the real database but was
-- never captured by any tracked migration - same root cause as
-- 20260803000000_baseline. Reconstructed from the schema.prisma state
-- immediately before this table's first migration reference
-- (20260827200000_add_ecommerce_integration_platform, which ALTERs it), at
-- commit 0ddc79c~1. Metadata-only for local shadow-database replay - never
-- run against the real database, which already has this table.
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_images_product_id_position_idx" ON "product_images"("product_id", "position");

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
