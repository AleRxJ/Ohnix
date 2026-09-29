-- Restaurant mode for the Caja: tables, open tabs and their items.

-- CreateEnum
CREATE TYPE "TableTabStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_tabs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "status" "TableTabStatus" NOT NULL DEFAULT 'open',
    "guests" INTEGER,
    "note" TEXT,
    "order_id" TEXT,
    "opened_by" TEXT NOT NULL,
    "closed_by" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_tab_items" (
    "id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_tab_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dining_tables_account_id_idx" ON "dining_tables"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_point_of_sale_id_name_key" ON "dining_tables"("point_of_sale_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "table_tabs_order_id_key" ON "table_tabs"("order_id");

-- CreateIndex
CREATE INDEX "table_tabs_account_id_status_idx" ON "table_tabs"("account_id", "status");

-- CreateIndex
CREATE INDEX "table_tabs_table_id_status_idx" ON "table_tabs"("table_id", "status");

-- CreateIndex
CREATE INDEX "table_tab_items_tab_id_idx" ON "table_tab_items"("tab_id");

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_tabs" ADD CONSTRAINT "table_tabs_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_tabs" ADD CONSTRAINT "table_tabs_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_tab_items" ADD CONSTRAINT "table_tab_items_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "table_tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_tab_items" ADD CONSTRAINT "table_tab_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one OPEN tab per table - not expressible in schema.prisma (partial
-- index), so it lives here. A second device opening the same table gets a
-- unique violation, which tableTab.service.js turns into "already open".
CREATE UNIQUE INDEX "table_tabs_one_open_per_table" ON "table_tabs"("table_id") WHERE "status" = 'open';
