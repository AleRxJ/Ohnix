-- AlterTable
ALTER TABLE "companies"
  ADD COLUMN "is_withholding_agent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "withholding_agent_effective_from" TIMESTAMP(3),
  ADD COLUMN "ica_municipality_code" TEXT,
  ADD COLUMN "ica_activity_code" TEXT,
  ADD COLUMN "ica_rate_per_thousand" DECIMAL(6,3);
