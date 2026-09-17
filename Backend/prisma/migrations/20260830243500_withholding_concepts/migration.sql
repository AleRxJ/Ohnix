CREATE TYPE "WithholdingTaxType" AS ENUM ('income', 'vat', 'ica');
CREATE TYPE "WithholdingBaseType" AS ENUM ('subtotal', 'vat', 'total');

CREATE TABLE "withholding_concepts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_type" "WithholdingTaxType" NOT NULL,
    "base_type" "WithholdingBaseType" NOT NULL,
    "rate_percent" DECIMAL(8,4) NOT NULL,
    "minimum_base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "municipality_code" TEXT,
    "chart_account_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "withholding_concepts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withholding_concepts_account_id_code_effective_from_key"
ON "withholding_concepts"("account_id", "code", "effective_from");
CREATE INDEX "withholding_concepts_account_id_is_active_effective_from_idx"
ON "withholding_concepts"("account_id", "is_active", "effective_from");
CREATE INDEX "withholding_concepts_chart_account_id_idx"
ON "withholding_concepts"("chart_account_id");

ALTER TABLE "withholding_concepts"
ADD CONSTRAINT "withholding_concepts_chart_account_id_fkey"
FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withholding_concepts"
ADD CONSTRAINT "withholding_concepts_rate_check"
CHECK ("rate_percent" > 0 AND "rate_percent" <= 100);

ALTER TABLE "withholding_concepts"
ADD CONSTRAINT "withholding_concepts_minimum_base_check"
CHECK ("minimum_base_amount" >= 0);

ALTER TABLE "withholding_concepts"
ADD CONSTRAINT "withholding_concepts_effective_range_check"
CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
