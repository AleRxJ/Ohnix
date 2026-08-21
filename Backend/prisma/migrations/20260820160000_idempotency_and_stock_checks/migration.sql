-- Two independent hardening changes surfaced by the multi-user concurrency
-- audit (2026-08-20): the existing atomic-claim UPDATE pattern
-- (`stock: {gte: X}` inside prisma.$transaction) already prevents two
-- concurrent users from double-spending the same stock, but it has no
-- defense against (a) the same request being retried after a timeout, which
-- looks identical to a second, legitimate operation, and (b) an impossible
-- value ever being written by code that bypasses the guarded UPDATE (a raw
-- SQL fixup, an admin script, a future endpoint). Neither gap has ever been
-- observed causing bad data - this is a preventive backstop, not a fix for
-- a reproduced bug.

-- (a) Idempotency-Key support - see IdempotencyKey model / idempotency.middleware.js.
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_account_id_scope_key_key" ON "idempotency_keys"("account_id", "scope", "key");

-- (b) DB-level backstop for the two invariants the app-level CAS pattern is
-- already responsible for. These only ever fire if something bypasses that
-- pattern - existing writes are unaffected.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0);

ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_returned_quantity_bounds" CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");
