ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'period_reopen';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'period_reclose';

ALTER TABLE "accounting_periods" ADD COLUMN "reopened_until" TIMESTAMP(3);

CREATE TABLE "accounting_period_reopenings" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reopened_by" TEXT NOT NULL,
  "reopened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "reclosed_by" TEXT,
  "reclosed_at" TIMESTAMP(3),
  CONSTRAINT "accounting_period_reopenings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_period_reopenings_period_id_reopened_at_idx" ON "accounting_period_reopenings"("period_id", "reopened_at");
ALTER TABLE "accounting_period_reopenings" ADD CONSTRAINT "accounting_period_reopenings_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
