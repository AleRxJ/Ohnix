-- Baseline catch-up: these columns exist in the real database and are
-- actively declared in schema.prisma, but were never captured by any
-- tracked migration (same root cause as 20260803000000_baseline - manual/
-- out-of-band changes predating migration history tracking). None of these
-- are ever ALTERed again by a later migration, so unlike the table-level
-- catch-ups in this history, there's no earlier "as it was originally"
-- state to reconstruct - the current schema.prisma definition IS the
-- original one. Metadata-only for local shadow-database replay - never run
-- against the real database, which already has these columns.
ALTER TABLE "users" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'dark';

ALTER TABLE "plan_upgrade_requests" ADD COLUMN "period_starts_at" TIMESTAMP(3);
ALTER TABLE "plan_upgrade_requests" ADD COLUMN "period_ends_at" TIMESTAMP(3);

ALTER TABLE "categories" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "purchases" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "units" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "suppliers" ADD COLUMN "identification_document_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "identification" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "legal_organization_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "tribute_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "municipality_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "country_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "not_obligated_to_invoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "is_tutorial_data" BOOLEAN NOT NULL DEFAULT false;
