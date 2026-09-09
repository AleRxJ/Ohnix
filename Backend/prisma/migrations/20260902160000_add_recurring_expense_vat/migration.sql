ALTER TABLE "recurring_expense_templates" ADD COLUMN "tax_treatment" "ProductTaxTreatment" NOT NULL DEFAULT 'excluded';
ALTER TABLE "recurring_expense_templates" ADD COLUMN "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
