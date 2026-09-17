-- Align column names with the existing WithholdingTaxType vocabulary
-- (income/vat/ica) already used by PurchaseRetention/WithholdingConcept.
ALTER TABLE "customers" RENAME COLUMN "rete_fuente_percent" TO "withholding_income_percent";
ALTER TABLE "customers" RENAME COLUMN "rete_ica_percent" TO "withholding_ica_percent";
ALTER TABLE "customers" RENAME COLUMN "rete_iva_percent" TO "withholding_vat_percent";
