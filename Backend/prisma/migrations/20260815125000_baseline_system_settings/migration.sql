-- Baseline catch-up: "system_settings" exists in the real database but was
-- never captured by any tracked migration (created out-of-band before
-- migration history began being tracked here, same root cause as the
-- 20260803000000_baseline migration - see that migration's description).
-- Reconstructed from the schema.prisma state immediately before this
-- table's first migration reference (20260815130000_vat_snapshot_and_config,
-- which ALTERs it), at commit edf7b96~1. This is metadata-only for local
-- shadow-database replay - never run against the real database, which
-- already has this table (see prisma migrate resolve --applied).
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "low_stock_default_threshold" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
