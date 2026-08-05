-- Factus requires a separate numbering range per document type (invoices =
-- document code 21, credit notes = document code 22); they cannot share one.
ALTER TABLE "companies"
  ADD COLUMN "factus_credit_note_numbering_range_id" TEXT;
