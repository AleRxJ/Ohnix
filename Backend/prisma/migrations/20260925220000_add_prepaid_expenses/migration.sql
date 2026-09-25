-- Diferidos / gastos pagados por anticipado (prepaidExpense.service.js)
-- CreateEnum
CREATE TYPE "PrepaidExpenseStatus" AS ENUM ('active', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "CashMovementSourceType" ADD VALUE 'prepaid_expense';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'prepaid_expense';
ALTER TYPE "JournalSourceType" ADD VALUE 'prepaid_amortization';
ALTER TYPE "JournalSourceType" ADD VALUE 'prepaid_cancellation';

-- CreateTable
CREATE TABLE "prepaid_expenses" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "start_period" TEXT NOT NULL,
    "asset_account_id" TEXT NOT NULL,
    "expense_account_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "funding_cash_account_id" TEXT,
    "funding_entry_id" TEXT,
    "status" "PrepaidExpenseStatus" NOT NULL DEFAULT 'active',
    "months_amortized" INTEGER NOT NULL DEFAULT 0,
    "last_amortized_period" TEXT,
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prepaid_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prepaid_expenses_created_by_status_idx" ON "prepaid_expenses"("created_by", "status");

-- AddForeignKey
ALTER TABLE "prepaid_expenses" ADD CONSTRAINT "prepaid_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_expenses" ADD CONSTRAINT "prepaid_expenses_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_expenses" ADD CONSTRAINT "prepaid_expenses_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_expenses" ADD CONSTRAINT "prepaid_expenses_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

