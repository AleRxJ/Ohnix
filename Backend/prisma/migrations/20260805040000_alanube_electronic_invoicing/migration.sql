-- Alanube (Alegra e-provider) electronic invoicing support, kept alongside
-- the existing Factus integration via a per-company provider switch.
ALTER TABLE "companies"
  ADD COLUMN "electronic_invoicing_provider" TEXT NOT NULL DEFAULT 'alanube',
  ADD COLUMN "tax_identification" TEXT,
  ADD COLUMN "tax_identification_dv" TEXT,
  ADD COLUMN "alanube_company_id" TEXT,
  ADD COLUMN "alanube_test_set_id" TEXT,
  ADD COLUMN "alanube_invoice_resolution" JSONB,
  ADD COLUMN "alanube_credit_note_resolution" JSONB;
