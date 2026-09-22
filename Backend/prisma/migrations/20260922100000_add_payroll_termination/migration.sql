-- CreateEnum
CREATE TYPE "EmployeeTerminationReason" AS ENUM ('resignation', 'just_cause', 'without_just_cause', 'contract_expiration', 'mutual_agreement');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "contract_end_date" TIMESTAMP(3),
ADD COLUMN     "termination_reason" "EmployeeTerminationReason";

-- CreateTable
CREATE TABLE "electronic_payroll_adjustments" (
    "id" TEXT NOT NULL,
    "electronic_payroll_document_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'itcycle',
    "adjustment_type" TEXT NOT NULL,
    "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
    "external_id" TEXT,
    "reference_code" TEXT NOT NULL,
    "document_number" TEXT,
    "cune" TEXT,
    "raw_request" JSONB,
    "raw_response" JSONB,
    "error_message" TEXT,
    "certificate_id" TEXT,
    "certificate_provider" TEXT,
    "certificate_identifier" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electronic_payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_termination_settlements" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "termination_date" TIMESTAMP(3) NOT NULL,
    "termination_reason" "EmployeeTerminationReason" NOT NULL,
    "base_salary_snapshot" DECIMAL(14,2) NOT NULL,
    "severance_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "severance_interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "service_bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vacation_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "indemnity_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "indemnity_days" DECIMAL(6,2),
    "total_amount" DECIMAL(14,2) NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_termination_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "electronic_payroll_adjustments_external_id_key" ON "electronic_payroll_adjustments"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_payroll_adjustments_reference_code_key" ON "electronic_payroll_adjustments"("reference_code");

-- CreateIndex
CREATE INDEX "electronic_payroll_adjustments_electronic_payroll_document__idx" ON "electronic_payroll_adjustments"("electronic_payroll_document_id", "created_at");

-- CreateIndex
CREATE INDEX "electronic_payroll_adjustments_company_id_created_at_idx" ON "electronic_payroll_adjustments"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_termination_settlements_employee_id_key" ON "payroll_termination_settlements"("employee_id");

-- AddForeignKey
ALTER TABLE "electronic_payroll_adjustments" ADD CONSTRAINT "electronic_payroll_adjustments_electronic_payroll_document_fkey" FOREIGN KEY ("electronic_payroll_document_id") REFERENCES "electronic_payroll_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_payroll_adjustments" ADD CONSTRAINT "electronic_payroll_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_termination_settlements" ADD CONSTRAINT "payroll_termination_settlements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_termination_settlements" ADD CONSTRAINT "payroll_termination_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_termination_settlements" ADD CONSTRAINT "payroll_termination_settlements_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "CashMovementSourceType" ADD VALUE 'payroll_termination_settlement';

