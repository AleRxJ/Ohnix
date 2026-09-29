-- CreateEnum
CREATE TYPE "DemoRequestStatus" AS ENUM ('new', 'contacted', 'scheduled', 'completed', 'converted', 'discarded');

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_type" TEXT,
    "product_count_range" TEXT,
    "preferred_date" DATE,
    "preferred_slot" TEXT,
    "message" TEXT,
    "catalog_file_name" TEXT,
    "catalog_file_mime" TEXT,
    "catalog_file_data" BYTEA,
    "catalog_headers" JSONB,
    "catalog_rows" JSONB,
    "catalog_row_count" INTEGER NOT NULL DEFAULT 0,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "status" "DemoRequestStatus" NOT NULL DEFAULT 'new',
    "internal_notes" TEXT,
    "provisioned_user_id" TEXT,
    "provisioned_at" TIMESTAMP(3),
    "import_summary" JSONB,
    "access_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_requests_status_created_at_idx" ON "demo_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "demo_requests_email_idx" ON "demo_requests"("email");

-- AddForeignKey
ALTER TABLE "demo_requests" ADD CONSTRAINT "demo_requests_provisioned_user_id_fkey" FOREIGN KEY ("provisioned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

