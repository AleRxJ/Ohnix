ALTER TYPE "JournalSourceType" ADD VALUE 'recurring_expense';

CREATE TABLE "recurring_expense_templates" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expense_account_id" TEXT NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated_period" TEXT,
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_expense_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_expense_templates_created_by_is_active_idx" ON "recurring_expense_templates"("created_by", "is_active");

ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
