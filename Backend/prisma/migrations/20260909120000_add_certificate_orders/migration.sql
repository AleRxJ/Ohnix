CREATE TABLE "certificate_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "duration_years" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "payment_provider" TEXT DEFAULT 'epayco',
    "payment_session_id" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "is_test_payment" BOOLEAN,
    "paid_at" TIMESTAMP(3),
    "paid_amount" INTEGER,
    "paid_currency" TEXT,
    "entitlement_starts_at" TIMESTAMP(3),
    "entitlement_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "certificate_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_orders_payment_session_id_key" ON "certificate_orders"("payment_session_id");
CREATE INDEX "certificate_orders_company_id_payment_status_idx" ON "certificate_orders"("company_id", "payment_status");
ALTER TABLE "certificate_orders" ADD CONSTRAINT "certificate_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificate_orders" ADD CONSTRAINT "certificate_orders_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
