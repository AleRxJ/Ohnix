-- Per-location stock partition (Escala plan): splits Product.stock into one
-- balance per (product, PointOfSale), while Product.stock itself stays as
-- the account-wide total (see the model comments in schema.prisma).
--
-- Hand-written for the same reason as the previous add_point_of_sale
-- migration (this DATABASE_URL has no usable shadow database) - the
-- CreateTable/Index/ForeignKey statements below are exactly what
-- `prisma migrate diff --from-url ... --to-schema-datamodel ... --script`
-- emitted; only the backfill (step 3) is hand-added.

-- ── Step 1: new StockMovement source types for transfers ───────────────
-- Safe in the same transaction as everything else here since nothing in
-- this migration *uses* these values yet (PG 12+ only forbids using a
-- freshly added enum value within the transaction that added it - this
-- server runs PostgreSQL 18).
ALTER TYPE "StockMovementSourceType" ADD VALUE 'transfer_out';
ALTER TYPE "StockMovementSourceType" ADD VALUE 'transfer_in';

-- ── Step 2: create product_location_stock ───────────────────────────────
CREATE TABLE "product_location_stock" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_location_stock_pkey" PRIMARY KEY ("id")
);

-- ── Step 3: safety net - make sure every product's account has a default
-- PointOfSale to backfill into (mirrors the same safety net in
-- add_point_of_sale's migration, for the same reason: a historical
-- ownership transfer could leave products.created_by pointing at an id
-- that current membership state no longer resolves as an "account root").
INSERT INTO "points_of_sale" ("id", "account_id", "name", "is_default", "is_active", "created_at", "updated_at")
SELECT
    'pos_' || substr(md5(random()::text || clock_timestamp()::text || p."created_by"), 1, 20),
    p."created_by",
    'Principal',
    true,
    true,
    now(),
    now()
FROM (SELECT DISTINCT "created_by" FROM "products") p
WHERE NOT EXISTS (
    SELECT 1 FROM "points_of_sale" pos WHERE pos."account_id" = p."created_by"
);

-- ── Step 4: backfill - every product's current stock sits entirely at its
-- account's default location, since no transfer mechanism existed before
-- this migration and every historical movement was already attributed to
-- that same default PDV by add_point_of_sale's backfill.
INSERT INTO "product_location_stock" ("id", "product_id", "point_of_sale_id", "stock", "created_at", "updated_at")
SELECT
    'pls_' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 20),
    p."id",
    pos."id",
    p."stock",
    now(),
    now()
FROM "products" p
JOIN "points_of_sale" pos ON pos."account_id" = p."created_by" AND pos."is_default" = true;

-- ── Step 5: indexes + foreign keys (after the backfill, same reasoning as
-- add_point_of_sale: nothing to validate row-by-row while inserting) ────
CREATE INDEX "product_location_stock_point_of_sale_id_idx" ON "product_location_stock"("point_of_sale_id");
CREATE UNIQUE INDEX "product_location_stock_product_id_point_of_sale_id_key" ON "product_location_stock"("product_id", "point_of_sale_id");

ALTER TABLE "product_location_stock" ADD CONSTRAINT "product_location_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_location_stock" ADD CONSTRAINT "product_location_stock_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
