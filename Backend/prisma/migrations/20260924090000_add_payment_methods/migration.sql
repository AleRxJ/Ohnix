-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN     "fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method_id" TEXT;

-- AlterTable
ALTER TABLE "purchase_payments" ADD COLUMN     "fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method_id" TEXT;

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fee_fixed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expense_account_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_methods_account_id_is_active_idx" ON "payment_methods"("account_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_account_id_name_key" ON "payment_methods"("account_id", "name");

-- CreateIndex
CREATE INDEX "order_payments_payment_method_id_idx" ON "order_payments"("payment_method_id");

-- CreateIndex
CREATE INDEX "purchase_payments_payment_method_id_idx" ON "purchase_payments"("payment_method_id");

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

