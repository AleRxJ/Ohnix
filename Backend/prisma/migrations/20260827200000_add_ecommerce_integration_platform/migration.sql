-- E-commerce integration platform (see the architecture design conversation,
-- 2026-08-27): universal product model additions (SKU/barcode/brand/status),
-- variants, generic external-channel identifier mapping, the connector
-- architecture's connection/sync-log tables, Ohnix's own outbound webhook
-- subscriptions, and granular API key scopes. Every change here is purely
-- additive (new tables, new nullable columns, one new enum value) - nothing
-- existing is altered or dropped, so every pre-existing row/query keeps
-- working unchanged.

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('shopify', 'custom_api');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('connected', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('product', 'variant', 'order', 'customer');

-- CreateEnum
CREATE TYPE "SyncLogDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "SyncLogStatus" AS ENUM ('success', 'error');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'success', 'failed');

-- AlterEnum
ALTER TYPE "StockMovementSourceType" ADD VALUE 'channel_sync';

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: every API key created before scopes existed keeps its current
-- "full account access" behavior instead of silently losing access the
-- moment apiScopes.middleware.js starts enforcing requireScope() on the
-- public API routes - see utils/apiScopes.js#FULL_ACCESS_SCOPES.
UPDATE "api_keys" SET "scopes" = ARRAY[
    'products:read', 'products:write',
    'variants:read', 'variants:write',
    'inventory:read', 'inventory:write',
    'orders:read', 'orders:write',
    'customers:read', 'customers:write',
    'webhooks:write'
] WHERE "scopes" = ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "order_details" ADD COLUMN     "variant_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'ohnix',
ADD COLUMN     "external_connection_id" TEXT,
ADD COLUMN     "external_order_id" TEXT;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "variant_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "variant_id" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "options_label" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "selling_price" DECIMAL(12,2),
    "buying_price" DECIMAL(12,2),
    "weight_value" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'disconnected',
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials_encrypted" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_references" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "entity_type" "ExternalEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_url" TEXT,
    "metadata" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "direction" "SyncLogDirection" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_id" TEXT,
    "external_id" TEXT,
    "status" "SyncLogStatus" NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");

-- CreateIndex
CREATE INDEX "integration_connections_account_id_idx" ON "integration_connections"("account_id");

-- CreateIndex
CREATE INDEX "external_references_connection_id_idx" ON "external_references"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_connection_id_entity_type_entity_id_key" ON "external_references"("connection_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_connection_id_entity_type_external_id_key" ON "external_references"("connection_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "sync_logs_connection_id_created_at_idx" ON "sync_logs"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_endpoints_account_id_idx" ON "webhook_endpoints"("account_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_event_id_key" ON "webhook_deliveries"("endpoint_id", "event_id");

-- CreateIndex
CREATE INDEX "order_details_variant_id_idx" ON "order_details"("variant_id");

-- CreateIndex
CREATE INDEX "orders_external_connection_id_idx" ON "orders"("external_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_external_connection_id_external_order_id_key" ON "orders"("external_connection_id", "external_order_id");

-- CreateIndex
CREATE INDEX "product_images_variant_id_idx" ON "product_images"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_created_by_key" ON "products"("sku", "created_by");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_external_connection_id_fkey" FOREIGN KEY ("external_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_details" ADD CONSTRAINT "order_details_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
