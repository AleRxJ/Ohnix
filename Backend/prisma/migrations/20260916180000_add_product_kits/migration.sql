ALTER TABLE "products" ADD COLUMN "is_kit" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "product_kit_components" (
    "id" TEXT NOT NULL,
    "kit_product_id" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_kit_components_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_kit_components_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "product_kit_components_kit_product_id_component_product_i_key" ON "product_kit_components"("kit_product_id", "component_product_id");
CREATE INDEX "product_kit_components_kit_product_id_position_idx" ON "product_kit_components"("kit_product_id", "position");
CREATE INDEX "product_kit_components_component_product_id_idx" ON "product_kit_components"("component_product_id");

ALTER TABLE "product_kit_components" ADD CONSTRAINT "product_kit_components_kit_product_id_fkey" FOREIGN KEY ("kit_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_kit_components" ADD CONSTRAINT "product_kit_components_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
