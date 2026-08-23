-- AlterTable
ALTER TABLE "purchase_details" ADD COLUMN     "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate_applied" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_treatment_applied" "ProductTaxTreatment" NOT NULL DEFAULT 'taxed';
