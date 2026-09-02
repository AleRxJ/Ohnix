CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "manual_journal_voucher_lines" ADD COLUMN "cost_center_id" TEXT;
ALTER TABLE "journal_entry_lines" ADD COLUMN "cost_center_id" TEXT;

CREATE UNIQUE INDEX "cost_centers_account_id_code_key" ON "cost_centers"("account_id", "code");
CREATE INDEX "cost_centers_account_id_is_active_idx" ON "cost_centers"("account_id", "is_active");
CREATE INDEX "manual_journal_voucher_lines_cost_center_id_idx" ON "manual_journal_voucher_lines"("cost_center_id");
CREATE INDEX "journal_entry_lines_cost_center_id_idx" ON "journal_entry_lines"("cost_center_id");

ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_journal_voucher_lines" ADD CONSTRAINT "manual_journal_voucher_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
