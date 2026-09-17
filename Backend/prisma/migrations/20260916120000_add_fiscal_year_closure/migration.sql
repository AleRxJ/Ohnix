ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'year_close';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'year_reopen';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'year_reclose';

CREATE TYPE "FiscalYearClosureStatus" AS ENUM ('closed', 'reopened');

CREATE TABLE "fiscal_year_closures" (
  "id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "FiscalYearClosureStatus" NOT NULL DEFAULT 'closed',
  "closed_by" TEXT NOT NULL,
  "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reopened_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_year_closures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_year_closures_created_by_year_key" ON "fiscal_year_closures"("created_by", "year");
CREATE INDEX "fiscal_year_closures_created_by_status_idx" ON "fiscal_year_closures"("created_by", "status");

ALTER TABLE "fiscal_year_closures" ADD CONSTRAINT "fiscal_year_closures_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_year_closures" ADD CONSTRAINT "fiscal_year_closures_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fiscal_year_reopenings" (
  "id" TEXT NOT NULL,
  "closure_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reopened_by" TEXT NOT NULL,
  "reopened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "reclosed_by" TEXT,
  "reclosed_at" TIMESTAMP(3),
  CONSTRAINT "fiscal_year_reopenings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscal_year_reopenings_closure_id_reopened_at_idx" ON "fiscal_year_reopenings"("closure_id", "reopened_at");
ALTER TABLE "fiscal_year_reopenings" ADD CONSTRAINT "fiscal_year_reopenings_closure_id_fkey"
  FOREIGN KEY ("closure_id") REFERENCES "fiscal_year_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
