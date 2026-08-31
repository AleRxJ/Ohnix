ALTER TABLE "order_details"
ADD COLUMN "returned_tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
