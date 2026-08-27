-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('draft', 'received', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "purchase_quotations" (
    "id" TEXT NOT NULL,
    "quotation_no" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'draft',
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "converted_purchase_id" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_quotation_details" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitcost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_quotation_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotations_quotation_no_key" ON "purchase_quotations"("quotation_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotations_converted_purchase_id_key" ON "purchase_quotations"("converted_purchase_id");

-- CreateIndex
CREATE INDEX "purchase_quotations_created_by_idx" ON "purchase_quotations"("created_by");

-- CreateIndex
CREATE INDEX "purchase_quotations_supplier_id_idx" ON "purchase_quotations"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_quotations_point_of_sale_id_idx" ON "purchase_quotations"("point_of_sale_id");

-- CreateIndex
CREATE INDEX "purchase_quotation_details_quotation_id_idx" ON "purchase_quotation_details"("quotation_id");

-- CreateIndex
CREATE INDEX "purchase_quotation_details_product_id_idx" ON "purchase_quotation_details"("product_id");

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_converted_purchase_id_fkey" FOREIGN KEY ("converted_purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "purchase_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
