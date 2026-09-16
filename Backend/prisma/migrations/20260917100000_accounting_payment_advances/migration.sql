ALTER TYPE "CashMovementSourceType" ADD VALUE IF NOT EXISTS 'customer_advance';
ALTER TYPE "CashMovementSourceType" ADD VALUE IF NOT EXISTS 'supplier_advance';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'customer_advance';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'supplier_advance';
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'payment_credit_application';

ALTER TABLE "payment_credit_balances" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "order_payments" ADD COLUMN "applied_credit_id" TEXT;
ALTER TABLE "purchase_payments" ADD COLUMN "applied_credit_id" TEXT;

CREATE INDEX "order_payments_applied_credit_id_idx" ON "order_payments"("applied_credit_id");
CREATE INDEX "purchase_payments_applied_credit_id_idx" ON "purchase_payments"("applied_credit_id");

ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_applied_credit_id_fkey" FOREIGN KEY ("applied_credit_id") REFERENCES "payment_credit_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_applied_credit_id_fkey" FOREIGN KEY ("applied_credit_id") REFERENCES "payment_credit_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
