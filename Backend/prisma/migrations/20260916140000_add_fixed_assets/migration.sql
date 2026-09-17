ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'fixed_asset_depreciation';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'fixed_asset_disposal';

CREATE TYPE "FixedAssetStatus" AS ENUM ('active', 'disposed', 'fully_depreciated');

CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "acquisition_date" TIMESTAMP(3) NOT NULL,
    "acquisition_cost" DECIMAL(14,2) NOT NULL,
    "salvage_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "asset_account_id" TEXT NOT NULL,
    "depreciation_account_id" TEXT NOT NULL,
    "expense_account_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'active',
    "months_depreciated" INTEGER NOT NULL DEFAULT 0,
    "last_depreciated_period" TEXT,
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "disposed_at" TIMESTAMP(3),
    "disposed_by" TEXT,
    "disposal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_assets_cost_check" CHECK ("acquisition_cost" > 0),
    CONSTRAINT "fixed_assets_salvage_check" CHECK ("salvage_value" >= 0 AND "salvage_value" < "acquisition_cost"),
    CONSTRAINT "fixed_assets_useful_life_check" CHECK ("useful_life_months" > 0)
);

CREATE INDEX "fixed_assets_created_by_status_idx" ON "fixed_assets"("created_by", "status");

ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depreciation_account_id_fkey" FOREIGN KEY ("depreciation_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
