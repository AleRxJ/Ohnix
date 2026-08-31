ALTER TABLE "product_location_stock"
  ADD COLUMN "average_unit_cost" DECIMAL(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN "inventory_value" DECIMAL(16, 2) NOT NULL DEFAULT 0;

UPDATE "product_location_stock" pls
SET
  "average_unit_cost" = p."buying_price",
  "inventory_value" = ROUND(pls."stock" * p."buying_price", 2)
FROM "products" p
WHERE p.id = pls."product_id";

ALTER TABLE "product_location_stock"
  ADD CONSTRAINT "product_location_stock_average_cost_nonnegative"
    CHECK ("average_unit_cost" >= 0),
  ADD CONSTRAINT "product_location_stock_inventory_value_nonnegative"
    CHECK ("inventory_value" >= 0);

ALTER TABLE "stock_movements"
  ADD COLUMN "unit_cost_applied" DECIMAL(14, 4),
  ADD COLUMN "value_delta" DECIMAL(16, 2),
  ADD COLUMN "value_balance_after" DECIMAL(16, 2);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_unit_cost_nonnegative"
    CHECK ("unit_cost_applied" IS NULL OR "unit_cost_applied" >= 0),
  ADD CONSTRAINT "stock_movements_value_balance_nonnegative"
    CHECK ("value_balance_after" IS NULL OR "value_balance_after" >= 0);

ALTER TABLE "stock_transfers"
  ADD COLUMN "unit_cost_applied" DECIMAL(14, 4);

UPDATE "stock_transfers" st
SET "unit_cost_applied" = p."buying_price"
FROM "products" p
WHERE p.id = st."product_id"
  AND st."status" = 'in_transit'
  AND st."unit_cost_applied" IS NULL;
