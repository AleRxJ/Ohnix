CREATE TABLE "accounting_budgets" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "chart_account_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "dimension_key" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "alert_threshold_percent" DECIMAL(6,2) NOT NULL DEFAULT 10,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounting_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_budgets_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
    CONSTRAINT "accounting_budgets_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "accounting_budgets_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "accounting_budgets_threshold_check" CHECK ("alert_threshold_percent" BETWEEN 0 AND 1000),
    CONSTRAINT "accounting_budgets_dimension_check" CHECK (("cost_center_id" IS NULL AND "dimension_key" = '__all__') OR ("cost_center_id" IS NOT NULL AND "dimension_key" = "cost_center_id"))
);

CREATE UNIQUE INDEX "accounting_budgets_account_id_year_month_chart_account_id_dimension_key_key" ON "accounting_budgets"("account_id", "year", "month", "chart_account_id", "dimension_key");
CREATE INDEX "accounting_budgets_account_id_year_month_idx" ON "accounting_budgets"("account_id", "year", "month");
CREATE INDEX "accounting_budgets_cost_center_id_idx" ON "accounting_budgets"("cost_center_id");
CREATE INDEX "accounting_budgets_chart_account_id_idx" ON "accounting_budgets"("chart_account_id");
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
