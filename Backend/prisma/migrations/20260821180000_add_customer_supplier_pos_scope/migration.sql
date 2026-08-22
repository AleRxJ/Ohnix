-- Scope Customers and Suppliers to the Point of Sale they were created at
-- (2026-08-21 scoping decision: "por creación", same rule as
-- Order.pointOfSaleId/Purchase.pointOfSaleId - see that migration's header
-- for why this is hand-written instead of `prisma migrate dev`). A
-- restricted-scope team member only sees customers/suppliers created at
-- their own location(s); full-scope members (owner, posScopeAll, admin)
-- are unaffected either way, same as every other pointOfSaleId-scoped read.

-- ── Step 1: add point_of_sale_id nullable (expand) ──────────────────────
ALTER TABLE "customers" ADD COLUMN "point_of_sale_id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "point_of_sale_id" TEXT;

-- ── Step 2: safety net for any account with no default PointOfSale yet ──
-- Every account should already have one from the add-point-of-sale
-- migration (or ensureDefaultPointOfSale's lazy creation), but this covers
-- the same edge case that migration's own Step 3 covered: a customer/
-- supplier whose created_by doesn't currently resolve to an existing
-- default row.
INSERT INTO "points_of_sale" ("id", "account_id", "name", "is_default", "is_active", "created_at", "updated_at")
SELECT
    'pos_' || substr(md5(random()::text || clock_timestamp()::text || acc."account_id"), 1, 20),
    acc."account_id",
    'Principal',
    true,
    true,
    now(),
    now()
FROM (
    SELECT DISTINCT "created_by" AS "account_id" FROM "customers"
    UNION
    SELECT DISTINCT "created_by" FROM "suppliers"
) acc
WHERE NOT EXISTS (
    SELECT 1 FROM "points_of_sale" pos WHERE pos."account_id" = acc."account_id" AND pos."is_default" = true
);

-- ── Step 3: backfill from each row's existing account scope ────────────
-- customers.created_by / suppliers.created_by are already the resolved
-- accountId (never the acting team member's own id - see
-- teamContext.js), same invariant the add-point-of-sale migration relied
-- on for orders/purchases.
UPDATE "customers" c
SET "point_of_sale_id" = pos."id"
FROM "points_of_sale" pos
WHERE pos."account_id" = c."created_by" AND pos."is_default" = true;

UPDATE "suppliers" s
SET "point_of_sale_id" = pos."id"
FROM "points_of_sale" pos
WHERE pos."account_id" = s."created_by" AND pos."is_default" = true;

-- ── Step 4: contract - enforce NOT NULL now that every row has a value ─
ALTER TABLE "customers" ALTER COLUMN "point_of_sale_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "point_of_sale_id" SET NOT NULL;

CREATE INDEX "customers_point_of_sale_id_idx" ON "customers"("point_of_sale_id");
CREATE INDEX "suppliers_point_of_sale_id_idx" ON "suppliers"("point_of_sale_id");

ALTER TABLE "customers" ADD CONSTRAINT "customers_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
