-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('registered', 'received', 'in_review', 'approved', 'rejected', 'in_repair', 'waiting_part', 'ready', 'delivered', 'closed');

-- CreateEnum
CREATE TYPE "WarrantyCommunicationChannel" AS ENUM ('email', 'whatsapp');

-- CreateEnum
CREATE TYPE "WarrantyCommunicationStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "warranty_counters" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "warranty_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "warranty_number" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "point_of_sale_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "order_detail_id" TEXT,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serial_number" TEXT,
    "sku_snapshot" TEXT,
    "product_name_snapshot" TEXT NOT NULL,
    "customer_name_snapshot" TEXT NOT NULL,
    "customer_phone_snapshot" TEXT,
    "customer_whatsapp_snapshot" TEXT,
    "customer_email_snapshot" TEXT,
    "invoice_no_snapshot" TEXT,
    "purchase_date" TIMESTAMP(3),
    "warranty_start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warranty_duration_days" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "problem_description" TEXT NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'registered',
    "assigned_to" TEXT,
    "observations" TEXT,
    "resolution" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_events" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" "WarrantyStatus",
    "new_status" "WarrantyStatus",
    "comment" TEXT,
    "actor_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_attachments" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT,
    "content_type" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_communications" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "channel" "WarrantyCommunicationChannel" NOT NULL,
    "event_trigger" TEXT NOT NULL,
    "template_key" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "status" "WarrantyCommunicationStatus" NOT NULL DEFAULT 'pending',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_notification_templates" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "event" "WarrantyStatus" NOT NULL,
    "channel" "WarrantyCommunicationChannel" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body_template" TEXT NOT NULL,
    "meta_template_name" TEXT,
    "meta_template_language" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_module_settings" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "enabled_statuses" "WarrantyStatus"[],
    "default_warranty_duration_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_counters_created_by_year_key" ON "warranty_counters"("created_by", "year");

-- CreateIndex
CREATE INDEX "warranties_created_by_idx" ON "warranties"("created_by");

-- CreateIndex
CREATE INDEX "warranties_point_of_sale_id_idx" ON "warranties"("point_of_sale_id");

-- CreateIndex
CREATE INDEX "warranties_customer_id_idx" ON "warranties"("customer_id");

-- CreateIndex
CREATE INDEX "warranties_product_id_idx" ON "warranties"("product_id");

-- CreateIndex
CREATE INDEX "warranties_order_id_idx" ON "warranties"("order_id");

-- CreateIndex
CREATE INDEX "warranties_status_idx" ON "warranties"("status");

-- CreateIndex
CREATE INDEX "warranties_due_date_idx" ON "warranties"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_created_by_warranty_number_key" ON "warranties"("created_by", "warranty_number");

-- CreateIndex
CREATE INDEX "warranty_events_warranty_id_created_at_idx" ON "warranty_events"("warranty_id", "created_at");

-- CreateIndex
CREATE INDEX "warranty_attachments_warranty_id_idx" ON "warranty_attachments"("warranty_id");

-- CreateIndex
CREATE INDEX "warranty_communications_warranty_id_created_at_idx" ON "warranty_communications"("warranty_id", "created_at");

-- CreateIndex
CREATE INDEX "warranty_communications_status_next_attempt_at_idx" ON "warranty_communications"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_notification_templates_created_by_event_channel_key" ON "warranty_notification_templates"("created_by", "event", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_module_settings_created_by_key" ON "warranty_module_settings"("created_by");

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_order_detail_id_fkey" FOREIGN KEY ("order_detail_id") REFERENCES "order_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_events" ADD CONSTRAINT "warranty_events_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_attachments" ADD CONSTRAINT "warranty_attachments_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_communications" ADD CONSTRAINT "warranty_communications_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

