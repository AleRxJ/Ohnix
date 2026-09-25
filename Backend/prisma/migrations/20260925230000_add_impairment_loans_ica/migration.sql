-- Deterioro de cartera, obligaciones financieras y declaración de ICA
-- CreateEnum
CREATE TYPE "FinancialObligationStatus" AS ENUM ('active', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "IcaPeriodicity" AS ENUM ('annual', 'bimonthly');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementSourceType" ADD VALUE 'loan_disbursement';
ALTER TYPE "CashMovementSourceType" ADD VALUE 'loan_payment';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'receivable_impairment';
ALTER TYPE "JournalSourceType" ADD VALUE 'loan_disbursement';
ALTER TYPE "JournalSourceType" ADD VALUE 'loan_payment';
ALTER TYPE "JournalSourceType" ADD VALUE 'ica_declaration';
ALTER TYPE "JournalSourceType" ADD VALUE 'ica_declaration_void';
ALTER TYPE "JournalSourceType" ADD VALUE 'ica_payment';

-- CreateTable
CREATE TABLE "receivable_impairment_runs" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "rates" JSONB NOT NULL,
    "bucket_totals" JSONB NOT NULL,
    "required_provision" DECIMAL(14,2) NOT NULL,
    "previous_provision" DECIMAL(14,2) NOT NULL,
    "adjustment" DECIMAL(14,2) NOT NULL,
    "journal_entry_id" TEXT,
    "run_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_impairment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_obligations" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "lender_name" TEXT NOT NULL,
    "reference" TEXT,
    "principal" DECIMAL(14,2) NOT NULL,
    "annual_rate" DECIMAL(7,4) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "disbursement_date" TIMESTAMP(3) NOT NULL,
    "first_payment_date" TIMESTAMP(3) NOT NULL,
    "liability_account_id" TEXT NOT NULL,
    "interest_account_id" TEXT NOT NULL,
    "disbursement_cash_account_id" TEXT,
    "disbursement_entry_id" TEXT,
    "status" "FinancialObligationStatus" NOT NULL DEFAULT 'active',
    "installments_paid" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_obligation_payments" (
    "id" TEXT NOT NULL,
    "obligation_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interest" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "journal_entry_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_obligation_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ica_declarations" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "periodicity" "IcaPeriodicity" NOT NULL,
    "year" INTEGER NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "gross_income" DECIMAL(14,2) NOT NULL,
    "excluded_income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_base" DECIMAL(14,2) NOT NULL,
    "rate_per_thousand" DECIMAL(6,3) NOT NULL,
    "ica_tax" DECIMAL(14,2) NOT NULL,
    "avisos_tableros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bomberil_surcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withheld_ica_applied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(14,2) NOT NULL DEFAULT 0,
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

    CONSTRAINT "ica_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receivable_impairment_runs_created_by_as_of_date_idx" ON "receivable_impairment_runs"("created_by", "as_of_date");

-- CreateIndex
CREATE INDEX "financial_obligations_created_by_status_idx" ON "financial_obligations"("created_by", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_obligation_payments_obligation_id_installment_num_key" ON "financial_obligation_payments"("obligation_id", "installment_number");

-- CreateIndex
CREATE INDEX "ica_declarations_created_by_status_end_date_idx" ON "ica_declarations"("created_by", "status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "ica_declarations_created_by_periodicity_year_period_number_key" ON "ica_declarations"("created_by", "periodicity", "year", "period_number");

-- AddForeignKey
ALTER TABLE "receivable_impairment_runs" ADD CONSTRAINT "receivable_impairment_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_liability_account_id_fkey" FOREIGN KEY ("liability_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_interest_account_id_fkey" FOREIGN KEY ("interest_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligation_payments" ADD CONSTRAINT "financial_obligation_payments_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ica_declarations" ADD CONSTRAINT "ica_declarations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

