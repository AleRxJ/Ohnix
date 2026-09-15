CREATE TABLE "payment_credit_balances" (
 "id" TEXT NOT NULL,
 "account_id" TEXT NOT NULL,
 "customer_id" TEXT,
 "supplier_id" TEXT,
 "source_order_payment_id" TEXT,
 "source_purchase_payment_id" TEXT,
 "amount" DECIMAL(14,2) NOT NULL,
 "applied_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "status" TEXT NOT NULL DEFAULT 'open',
 "created_by" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "payment_credit_balances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_credit_balances_account_id_status_idx" ON "payment_credit_balances"("account_id", "status");
CREATE INDEX "payment_credit_balances_customer_id_status_idx" ON "payment_credit_balances"("customer_id", "status");
CREATE INDEX "payment_credit_balances_supplier_id_status_idx" ON "payment_credit_balances"("supplier_id", "status");
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_order_payment_id_fkey" FOREIGN KEY ("source_order_payment_id") REFERENCES "order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_purchase_payment_id_fkey" FOREIGN KEY ("source_purchase_payment_id") REFERENCES "purchase_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
