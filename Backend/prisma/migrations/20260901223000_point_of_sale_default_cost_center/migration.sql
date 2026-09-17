ALTER TABLE "points_of_sale" ADD COLUMN "default_cost_center_id" TEXT;
CREATE INDEX "points_of_sale_default_cost_center_id_idx" ON "points_of_sale"("default_cost_center_id");
ALTER TABLE "points_of_sale" ADD CONSTRAINT "points_of_sale_default_cost_center_id_fkey" FOREIGN KEY ("default_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
