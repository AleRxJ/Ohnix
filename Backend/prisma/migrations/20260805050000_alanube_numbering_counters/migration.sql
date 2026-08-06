-- Alanube requires the caller to supply each document's sequential number
-- (no server-side auto-numbering like Factus), so we track it per company.
ALTER TABLE "companies"
  ADD COLUMN "alanube_next_invoice_number" INTEGER,
  ADD COLUMN "alanube_next_credit_note_number" INTEGER;
