ALTER TABLE "sales_quotations" ADD COLUMN "public_token" TEXT;
CREATE UNIQUE INDEX "sales_quotations_public_token_key" ON "sales_quotations"("public_token");