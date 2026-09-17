ALTER TABLE "purchase_details"
ADD COLUMN "returned_tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "purchase_details"
SET "returned_tax_amount" = LEAST("tax_amount", ROUND("refund_amount" * "tax_rate_applied" / 100, 2))
WHERE "returned_quantity" > 0;
ALTER TABLE "purchase_details"
ADD CONSTRAINT "purchase_details_returned_tax_amount_check"
CHECK ("returned_tax_amount" >= 0 AND "returned_tax_amount" <= "tax_amount");

CREATE TABLE "purchase_retentions" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "concept_id" TEXT,
    "concept_code" TEXT NOT NULL,
    "concept_name" TEXT NOT NULL,
    "tax_type" "WithholdingTaxType" NOT NULL,
    "base_type" "WithholdingBaseType" NOT NULL,
    "rate_percent" DECIMAL(8,4) NOT NULL,
    "minimum_base_amount" DECIMAL(14,2) NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "withheld_amount" DECIMAL(14,2) NOT NULL,
    "returned_base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returned_withheld_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "municipality_code" TEXT,
    "chart_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_retentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_retentions_purchase_id_concept_code_key"
ON "purchase_retentions"("purchase_id", "concept_code");
CREATE INDEX "purchase_retentions_purchase_id_idx" ON "purchase_retentions"("purchase_id");
CREATE INDEX "purchase_retentions_concept_id_idx" ON "purchase_retentions"("concept_id");
CREATE INDEX "purchase_retentions_chart_account_id_idx" ON "purchase_retentions"("chart_account_id");

ALTER TABLE "purchase_retentions" ADD CONSTRAINT "purchase_retentions_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_retentions" ADD CONSTRAINT "purchase_retentions_concept_id_fkey"
FOREIGN KEY ("concept_id") REFERENCES "withholding_concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_retentions" ADD CONSTRAINT "purchase_retentions_chart_account_id_fkey"
FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_retentions" ADD CONSTRAINT "purchase_retentions_amounts_check"
CHECK (
  "base_amount" >= 0 AND "withheld_amount" >= 0 AND
  "returned_base_amount" >= 0 AND "returned_base_amount" <= "base_amount" AND
  "returned_withheld_amount" >= 0 AND "returned_withheld_amount" <= "withheld_amount"
);
