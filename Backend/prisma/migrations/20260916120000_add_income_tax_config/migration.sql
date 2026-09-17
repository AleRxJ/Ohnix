-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('ordinario', 'simple');

-- CreateEnum
CREATE TYPE "SimpleRegimeGroup" AS ENUM ('group1', 'group2', 'group3', 'group4');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "simple_regime_group" "SimpleRegimeGroup",
ADD COLUMN     "tax_regime" "TaxRegime";

-- CreateTable
CREATE TABLE "income_tax_year_configs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ordinary_rate_percent" DECIMAL(5,2) NOT NULL,
    "uvt_value" DECIMAL(12,2) NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_tax_year_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simple_regime_brackets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "group" "SimpleRegimeGroup" NOT NULL,
    "min_uvt" DECIMAL(10,2) NOT NULL,
    "max_uvt" DECIMAL(10,2),
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simple_regime_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_tax_year_configs_year_key" ON "income_tax_year_configs"("year");

-- CreateIndex
CREATE INDEX "simple_regime_brackets_year_group_idx" ON "simple_regime_brackets"("year", "group");

-- CreateIndex
CREATE UNIQUE INDEX "simple_regime_brackets_year_group_min_uvt_key" ON "simple_regime_brackets"("year", "group", "min_uvt");

