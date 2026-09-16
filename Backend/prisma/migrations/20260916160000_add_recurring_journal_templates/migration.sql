ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'recurring_journal';

CREATE TABLE "recurring_journal_templates" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated_period" TEXT,
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_journal_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_journal_templates_created_by_is_active_idx" ON "recurring_journal_templates"("created_by", "is_active");
ALTER TABLE "recurring_journal_templates" ADD CONSTRAINT "recurring_journal_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "recurring_journal_template_lines" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "chart_account_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "third_party_type" "AccountingThirdPartyType",
    "third_party_id" TEXT,
    "third_party_name" TEXT,
    "third_party_document" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "recurring_journal_template_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_journal_template_line_one_side_positive" CHECK (
        ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
    )
);

CREATE INDEX "recurring_journal_template_lines_template_id_position_idx" ON "recurring_journal_template_lines"("template_id", "position");
CREATE INDEX "recurring_journal_template_lines_chart_account_id_idx" ON "recurring_journal_template_lines"("chart_account_id");
CREATE INDEX "recurring_journal_template_lines_cost_center_id_idx" ON "recurring_journal_template_lines"("cost_center_id");

ALTER TABLE "recurring_journal_template_lines" ADD CONSTRAINT "recurring_journal_template_lines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recurring_journal_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_journal_template_lines" ADD CONSTRAINT "recurring_journal_template_lines_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_journal_template_lines" ADD CONSTRAINT "recurring_journal_template_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
