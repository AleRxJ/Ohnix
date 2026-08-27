CREATE TYPE "SalesQuotationDiscountType" AS ENUM ('percentage', 'fixed');
ALTER TABLE "sales_quotations" ADD COLUMN "discount_type" "SalesQuotationDiscountType" NOT NULL DEFAULT 'percentage';