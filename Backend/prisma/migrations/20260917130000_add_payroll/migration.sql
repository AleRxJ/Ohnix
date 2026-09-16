ALTER TABLE "companies" ADD COLUMN "payroll_aportes_exonerados" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'payroll_payment';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'payroll_benefit_settlement';

ALTER TYPE "CashMovementSourceType" ADD VALUE IF NOT EXISTS 'payroll_payment';
ALTER TYPE "CashMovementSourceType" ADD VALUE IF NOT EXISTS 'payroll_benefit_settlement';

CREATE TYPE "PayrollPeriodicity" AS ENUM ('monthly', 'biweekly', 'weekly');
CREATE TYPE "EmployeeContractType" AS ENUM ('indefinido', 'fijo', 'obra_labor', 'aprendizaje');
CREATE TYPE "EmployeeWorkerType" AS ENUM ('normal', 'pensionado', 'aprendiz', 'alto_riesgo');
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive', 'terminated');
CREATE TYPE "ArlRiskLevel" AS ENUM ('I', 'II', 'III', 'IV', 'V');
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('draft', 'calculated', 'approved', 'paid', 'cancelled');
CREATE TYPE "PayrollDocumentStatus" AS ENUM ('draft', 'calculated', 'approved', 'paid', 'cancelled');
CREATE TYPE "PayrollConceptCategory" AS ENUM ('earning', 'deduction', 'employer_contribution');
CREATE TYPE "PayrollConceptCode" AS ENUM (
    'basic_salary',
    'transport_allowance',
    'overtime_day',
    'overtime_night',
    'surcharge_night',
    'surcharge_sunday_holiday',
    'overtime_sunday_holiday_day',
    'overtime_sunday_holiday_night',
    'common_vacation',
    'bonus',
    'other_earning',
    'health_employee',
    'pension_employee',
    'pension_solidarity_fund',
    'withholding_tax',
    'other_deduction',
    'health_employer',
    'pension_employer',
    'arl',
    'sena',
    'icbf',
    'compensation_fund',
    'severance_employer',
    'severance_interest_employer',
    'service_bonus_employer',
    'vacation_provision'
);
CREATE TYPE "BenefitAccrualType" AS ENUM ('severance', 'severance_interest', 'service_bonus', 'vacation');

CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'CC',
    "document_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "second_name" TEXT,
    "last_name" TEXT NOT NULL,
    "second_last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "hire_date" TIMESTAMP(3) NOT NULL,
    "termination_date" TIMESTAMP(3),
    "contract_type" "EmployeeContractType" NOT NULL DEFAULT 'indefinido',
    "worker_type" "EmployeeWorkerType" NOT NULL DEFAULT 'normal',
    "pay_frequency" "PayrollPeriodicity" NOT NULL DEFAULT 'monthly',
    "base_salary" DECIMAL(14,2) NOT NULL,
    "is_integral_salary" BOOLEAN NOT NULL DEFAULT false,
    "risk_level" "ArlRiskLevel" NOT NULL DEFAULT 'I',
    "position" TEXT,
    "eps" TEXT,
    "pension_fund" TEXT,
    "severance_fund" TEXT,
    "compensation_fund" TEXT,
    "bank_name" TEXT,
    "bank_account_type" TEXT,
    "bank_account_number" TEXT,
    "work_city" TEXT,
    "point_of_sale_id" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_document_number_created_by_key" ON "employees"("document_number", "created_by");
CREATE INDEX "employees_created_by_status_idx" ON "employees"("created_by", "status");
CREATE INDEX "employees_point_of_sale_id_idx" ON "employees"("point_of_sale_id");

ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payroll_legal_parameters" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "smlmv" DECIMAL(14,2) NOT NULL,
    "transport_allowance" DECIMAL(14,2) NOT NULL,
    "uvt" DECIMAL(14,2) NOT NULL,
    "monthly_work_hours" DECIMAL(6,2) NOT NULL DEFAULT 240,
    "pension_solidarity_brackets" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_legal_parameters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_legal_parameters_year_key" ON "payroll_legal_parameters"("year");

CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "periodicity" "PayrollPeriodicity" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "payment_date" TIMESTAMP(3),
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'draft',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "calculated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_periods_created_by_status_idx" ON "payroll_periods"("created_by", "status");

ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payroll_documents" (
    "id" TEXT NOT NULL,
    "payroll_period_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "worked_days" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "base_salary_snapshot" DECIMAL(14,2) NOT NULL,
    "status" "PayrollDocumentStatus" NOT NULL DEFAULT 'draft',
    "total_earnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_employer_contributions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_documents_payroll_period_id_employee_id_key" ON "payroll_documents"("payroll_period_id", "employee_id");
CREATE INDEX "payroll_documents_employee_id_idx" ON "payroll_documents"("employee_id");

ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payroll_document_lines" (
    "id" TEXT NOT NULL,
    "payroll_document_id" TEXT NOT NULL,
    "category" "PayrollConceptCategory" NOT NULL,
    "concept_code" "PayrollConceptCode" NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2),
    "rate" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_document_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_document_lines_payroll_document_id_idx" ON "payroll_document_lines"("payroll_document_id");

ALTER TABLE "payroll_document_lines" ADD CONSTRAINT "payroll_document_lines_payroll_document_id_fkey" FOREIGN KEY ("payroll_document_id") REFERENCES "payroll_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_benefit_accruals" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" INTEGER,
    "type" "BenefitAccrualType" NOT NULL,
    "accrued_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settled_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accrued_days" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "used_days" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_benefit_accruals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_benefit_accruals_employee_id_year_semester_type_key" ON "employee_benefit_accruals"("employee_id", "year", "semester", "type");
CREATE INDEX "employee_benefit_accruals_employee_id_type_idx" ON "employee_benefit_accruals"("employee_id", "type");

ALTER TABLE "employee_benefit_accruals" ADD CONSTRAINT "employee_benefit_accruals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payroll_benefit_settlements" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "BenefitAccrualType" NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_benefit_settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_benefit_settlements_employee_id_type_idx" ON "payroll_benefit_settlements"("employee_id", "type");

ALTER TABLE "payroll_benefit_settlements" ADD CONSTRAINT "payroll_benefit_settlements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_benefit_settlements" ADD CONSTRAINT "payroll_benefit_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
