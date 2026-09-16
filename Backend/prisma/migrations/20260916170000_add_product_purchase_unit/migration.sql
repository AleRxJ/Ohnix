ALTER TABLE "products" ADD COLUMN "purchase_unit_id" TEXT;
ALTER TABLE "products" ADD COLUMN "purchase_unit_conversion_factor" DECIMAL(10,2);

ALTER TABLE "products" ADD CONSTRAINT "products_purchase_unit_conversion_factor_check" CHECK ("purchase_unit_conversion_factor" IS NULL OR "purchase_unit_conversion_factor" > 0);

CREATE INDEX "products_purchase_unit_id_idx" ON "products"("purchase_unit_id");
ALTER TABLE "products" ADD CONSTRAINT "products_purchase_unit_id_fkey" FOREIGN KEY ("purchase_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
