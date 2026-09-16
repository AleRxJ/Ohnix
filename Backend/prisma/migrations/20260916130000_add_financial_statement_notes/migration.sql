CREATE TABLE "financial_statement_notes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_statement_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_statement_notes_year_check" CHECK ("year" BETWEEN 2000 AND 2100)
);

CREATE INDEX "financial_statement_notes_account_id_year_position_idx" ON "financial_statement_notes"("account_id", "year", "position");

ALTER TABLE "financial_statement_notes" ADD CONSTRAINT "financial_statement_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_statement_notes" ADD CONSTRAINT "financial_statement_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_statement_notes" ADD CONSTRAINT "financial_statement_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
