-- Liquidación de IVA (vatSettlement.service.js)

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'vat_settlement';
ALTER TYPE "JournalSourceType" ADD VALUE 'vat_settlement_void';
ALTER TYPE "JournalSourceType" ADD VALUE 'vat_payment';

-- AlterEnum
ALTER TYPE "CashMovementSourceType" ADD VALUE 'tax_payment';

-- CreateEnum
CREATE TYPE "VatPeriodicity" AS ENUM ('bimonthly', 'four_monthly');

-- CreateEnum
CREATE TYPE "VatSettlementStatus" AS ENUM ('posted', 'paid', 'voided');

-- CreateTable
CREATE TABLE "vat_settlements" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "periodicity" "VatPeriodicity" NOT NULL,
    "year" INTEGER NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "generated_total" DECIMAL(14,2) NOT NULL,
    "deductible_total" DECIMAL(14,2) NOT NULL,
    "carry_forward_applied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "VatSettlementStatus" NOT NULL DEFAULT 'posted',
    "settlement_entry_id" TEXT,
    "payment_entry_id" TEXT,
    "paid_cash_account_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "settled_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vat_settlements_created_by_periodicity_year_period_number_key" ON "vat_settlements"("created_by", "periodicity", "year", "period_number");

-- CreateIndex
CREATE INDEX "vat_settlements_created_by_status_end_date_idx" ON "vat_settlements"("created_by", "status", "end_date");

-- AddForeignKey
ALTER TABLE "vat_settlements" ADD CONSTRAINT "vat_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
