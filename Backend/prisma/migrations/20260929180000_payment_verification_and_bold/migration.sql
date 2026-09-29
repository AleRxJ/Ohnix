-- Caja: payment verification (nivel 1) + Bold datáfono/link intents (niveles 2-3).
-- ALTER TYPE ... ADD VALUE is safe inside Prisma's migration transaction on
-- PostgreSQL 12+ as long as the new value isn't USED in the same transaction
-- (nothing below uses 'bold').

-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('not_required', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentIntentMode" AS ENUM ('terminal', 'link');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'voided', 'needs_review');

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'bold';

-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN     "verification_note" TEXT,
ADD COLUMN     "verification_source" TEXT,
ADD COLUMN     "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'not_required',
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" TEXT;

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "mode" "PaymentIntentMode" NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "reference" TEXT NOT NULL,
    "external_id" TEXT,
    "checkout_url" TEXT,
    "terminal_serial" TEXT,
    "terminal_model" TEXT,
    "cash_account_id" TEXT NOT NULL,
    "payment_method_id" TEXT,
    "provider_payment_id" TEXT,
    "order_payment_id" TEXT,
    "last_error" TEXT,
    "last_event" JSONB,
    "created_by" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_reference_key" ON "payment_intents"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_order_payment_id_key" ON "payment_intents"("order_payment_id");

-- CreateIndex
CREATE INDEX "payment_intents_account_id_created_at_idx" ON "payment_intents"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents"("order_id");

-- CreateIndex
CREATE INDEX "payment_intents_connection_id_status_idx" ON "payment_intents"("connection_id", "status");

-- CreateIndex
CREATE INDEX "order_payments_verification_status_idx" ON "order_payments"("verification_status");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

