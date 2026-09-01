ALTER TABLE "bank_statement_entries"
ADD COLUMN "import_fingerprint" TEXT;

CREATE UNIQUE INDEX "bank_statement_entries_cash_account_id_import_fingerprint_key"
ON "bank_statement_entries"("cash_account_id", "import_fingerprint");
