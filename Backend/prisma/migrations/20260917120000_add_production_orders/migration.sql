ALTER TABLE "products" ADD COLUMN "is_manufactured" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'production';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'production_reversal';

ALTER TYPE "StockMovementSourceType" ADD VALUE IF NOT EXISTS 'production_consumption';
ALTER TYPE "StockMovementSourceType" ADD VALUE IF NOT EXISTS 'production_output';
ALTER TYPE "StockMovementSourceType" ADD VALUE IF NOT EXISTS 'production_reversal';

CREATE TABLE "production_recipe_components" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_recipe_components_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_recipe_components_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "production_recipe_components_product_id_component_product_key" ON "production_recipe_components"("product_id", "component_product_id");
CREATE INDEX "production_recipe_components_product_id_position_idx" ON "production_recipe_components"("product_id", "position");
CREATE INDEX "production_recipe_components_component_product_id_idx" ON "production_recipe_components"("component_product_id");

ALTER TABLE "production_recipe_components" ADD CONSTRAINT "production_recipe_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_recipe_components" ADD CONSTRAINT "production_recipe_components_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "ProductionOrderStatus" AS ENUM ('draft', 'completed', 'cancelled');

CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'draft',
    "labor_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overhead_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materials_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_cost_applied" DECIMAL(14,4),
    "batch_number" TEXT,
    "batch_expiration_date" TIMESTAMP(3),
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "production_orders_created_by_status_idx" ON "production_orders"("created_by", "status");
CREATE INDEX "production_orders_product_id_idx" ON "production_orders"("product_id");
CREATE INDEX "production_orders_point_of_sale_id_idx" ON "production_orders"("point_of_sale_id");

ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "production_order_lines" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "quantity_required" DECIMAL(12,2) NOT NULL,
    "unit_cost_applied" DECIMAL(14,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "production_order_lines_production_order_id_idx" ON "production_order_lines"("production_order_id");
CREATE INDEX "production_order_lines_component_product_id_idx" ON "production_order_lines"("component_product_id");

ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
