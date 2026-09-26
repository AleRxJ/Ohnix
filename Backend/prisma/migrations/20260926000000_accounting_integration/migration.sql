-- Integración contable: castigo de cartera, abonos extraordinarios y causación de intereses
-- CreateEnum
CREATE TYPE "FinancialObligationPaymentKind" AS ENUM ('installment', 'extra');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'receivable_write_off';
ALTER TYPE "JournalSourceType" ADD VALUE 'receivable_write_off_reversal';
ALTER TYPE "JournalSourceType" ADD VALUE 'loan_interest_accrual';
ALTER TYPE "JournalSourceType" ADD VALUE 'loan_extra_payment';

-- AlterTable
ALTER TABLE "financial_obligations" ADD COLUMN     "interest_accrued_through" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planned_installment" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "financial_obligation_payments" ADD COLUMN     "kind" "FinancialObligationPaymentKind" NOT NULL DEFAULT 'installment',
ALTER COLUMN "installment_number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "receivable_write_offs" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "allowance_used" DECIMAL(14,2) NOT NULL,
    "expense_amount" DECIMAL(14,2) NOT NULL,
    "write_off_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "journal_entry_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "reversal_entry_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receivable_write_offs_created_by_reversed_at_idx" ON "receivable_write_offs"("created_by", "reversed_at");

-- CreateIndex
CREATE INDEX "receivable_write_offs_order_id_idx" ON "receivable_write_offs"("order_id");

-- AddForeignKey
ALTER TABLE "receivable_write_offs" ADD CONSTRAINT "receivable_write_offs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_write_offs" ADD CONSTRAINT "receivable_write_offs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

