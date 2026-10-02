-- Restaurant flow: waiter attribution, kitchen display, QR ordering, and the
-- "Cobrar en caja" (posCharge) capability.

-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('pending', 'preparing', 'ready', 'served');
CREATE TYPE "TableRequestType" AS ENUM ('order', 'call_waiter', 'bill');
CREATE TYPE "TableRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'done');

-- Waiter attribution
ALTER TABLE "table_tabs" ADD COLUMN "waiter_id" TEXT;
UPDATE "table_tabs" SET "waiter_id" = "opened_by" WHERE "waiter_id" IS NULL;
ALTER TABLE "orders" ADD COLUMN "waiter_id" TEXT;
CREATE INDEX "orders_waiter_id_idx" ON "orders"("waiter_id");

-- Kitchen display. Lines sent before this migration count as already served
-- so the kitchen screen doesn't open with a backlog of old comandas.
ALTER TABLE "table_tab_items"
    ADD COLUMN "kitchen_status" "KitchenStatus" NOT NULL DEFAULT 'pending',
    ADD COLUMN "ready_at" TIMESTAMP(3),
    ADD COLUMN "served_at" TIMESTAMP(3),
    ADD COLUMN "printed_at" TIMESTAMP(3);
UPDATE "table_tab_items"
SET "kitchen_status" = 'served', "served_at" = "sent_at", "printed_at" = "sent_at"
WHERE "sent_at" IS NOT NULL;

-- QR ordering
ALTER TABLE "dining_tables" ADD COLUMN "public_token" TEXT;
CREATE UNIQUE INDEX "dining_tables_public_token_key" ON "dining_tables"("public_token");
ALTER TABLE "points_of_sale" ADD COLUMN "qr_ordering_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories"
    ADD COLUMN "menu_visible" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "menu_sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "menu_description" TEXT;

-- CreateTable
CREATE TABLE "table_requests" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "tab_id" TEXT,
    "type" "TableRequestType" NOT NULL,
    "status" "TableRequestStatus" NOT NULL DEFAULT 'pending',
    "items" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "customer_name" TEXT,
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "table_requests_account_id_status_idx" ON "table_requests"("account_id", "status");
CREATE INDEX "table_requests_table_id_status_idx" ON "table_requests"("table_id", "status");

ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "table_tabs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- "Cobrar en caja": every existing non-owner role keeps charging exactly as
-- it did before this capability existed. New roles start without it.
UPDATE "team_roles"
SET "capabilities" = "capabilities" || '{"posCharge":true}'::jsonb
WHERE "is_owner_role" = false;
