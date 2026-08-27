-- Customer-facing sales quotations are separate from supplier purchase quotes.
CREATE TYPE "SalesQuotationStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted');

CREATE TABLE "sales_quotations" (
    "id" TEXT NOT NULL,
    "quotation_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'draft',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "converted_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_details" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sales_quotation_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_quotations_quotation_no_key" ON "sales_quotations"("quotation_no");
CREATE UNIQUE INDEX "sales_quotations_converted_order_id_key" ON "sales_quotations"("converted_order_id");
CREATE INDEX "sales_quotations_customer_id_idx" ON "sales_quotations"("customer_id");
CREATE INDEX "sales_quotations_point_of_sale_id_idx" ON "sales_quotations"("point_of_sale_id");
CREATE INDEX "sales_quotations_created_by_idx" ON "sales_quotations"("created_by");
CREATE INDEX "sales_quotations_status_idx" ON "sales_quotations"("status");
CREATE INDEX "sales_quotation_details_quotation_id_idx" ON "sales_quotation_details"("quotation_id");
CREATE INDEX "sales_quotation_details_product_id_idx" ON "sales_quotation_details"("product_id");

ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_details" ADD CONSTRAINT "sales_quotation_details_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_details" ADD CONSTRAINT "sales_quotation_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;