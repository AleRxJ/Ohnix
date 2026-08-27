ALTER TABLE "sales_quotations" ADD COLUMN "discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales_quotation_details" ADD COLUMN "discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;