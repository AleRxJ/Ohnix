ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'manual_journal';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'manual_journal_reversal';

CREATE TYPE "ManualVoucherStatus" AS ENUM ('draft', 'posted', 'voided');

CREATE TABLE "manual_journal_vouchers" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "status" "ManualVoucherStatus" NOT NULL DEFAULT 'draft',
  "entry_date" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "support_url" TEXT,
  "posted_entry_id" TEXT,
  "reversal_entry_id" TEXT,
  "created_by" TEXT NOT NULL,
  "posted_by" TEXT,
  "posted_at" TIMESTAMP(3),
  "voided_by" TEXT,
  "voided_at" TIMESTAMP(3),
  "void_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manual_journal_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "manual_journal_voucher_lines" (
  "id" TEXT NOT NULL,
  "voucher_id" TEXT NOT NULL,
  "chart_account_id" TEXT NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  CONSTRAINT "manual_journal_voucher_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_voucher_line_one_side_positive" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  )
);

CREATE UNIQUE INDEX "manual_journal_vouchers_posted_entry_id_key" ON "manual_journal_vouchers"("posted_entry_id");
CREATE UNIQUE INDEX "manual_journal_vouchers_reversal_entry_id_key" ON "manual_journal_vouchers"("reversal_entry_id");
CREATE INDEX "manual_journal_vouchers_account_id_status_entry_date_idx" ON "manual_journal_vouchers"("account_id", "status", "entry_date");
CREATE INDEX "manual_journal_voucher_lines_voucher_id_position_idx" ON "manual_journal_voucher_lines"("voucher_id", "position");
CREATE INDEX "manual_journal_voucher_lines_chart_account_id_idx" ON "manual_journal_voucher_lines"("chart_account_id");

ALTER TABLE "manual_journal_voucher_lines"
  ADD CONSTRAINT "manual_journal_voucher_lines_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "manual_journal_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_journal_voucher_lines"
  ADD CONSTRAINT "manual_journal_voucher_lines_chart_account_id_fkey"
  FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
