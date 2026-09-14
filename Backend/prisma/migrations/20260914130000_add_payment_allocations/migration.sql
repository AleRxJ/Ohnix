CREATE TABLE "order_payment_allocations" (
    "id" TEXT NOT NULL,
    "order_payment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_payment_allocations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "purchase_payment_allocations" (
    "id" TEXT NOT NULL,
    "purchase_payment_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_payment_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_payment_allocations_order_id_idx" ON "order_payment_allocations"("order_id");
CREATE INDEX "order_payment_allocations_order_payment_id_idx" ON "order_payment_allocations"("order_payment_id");
CREATE INDEX "purchase_payment_allocations_purchase_id_idx" ON "purchase_payment_allocations"("purchase_id");
CREATE INDEX "purchase_payment_allocations_purchase_payment_id_idx" ON "purchase_payment_allocations"("purchase_payment_id");
ALTER TABLE "order_payment_allocations" ADD CONSTRAINT "order_payment_allocations_order_payment_id_fkey" FOREIGN KEY ("order_payment_id") REFERENCES "order_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_payment_allocations" ADD CONSTRAINT "order_payment_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_payment_allocations" ADD CONSTRAINT "order_payment_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payment_allocations" ADD CONSTRAINT "purchase_payment_allocations_purchase_payment_id_fkey" FOREIGN KEY ("purchase_payment_id") REFERENCES "purchase_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payment_allocations" ADD CONSTRAINT "purchase_payment_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payment_allocations" ADD CONSTRAINT "purchase_payment_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
