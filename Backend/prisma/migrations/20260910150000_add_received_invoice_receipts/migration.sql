-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "issues_electronic_invoice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "received_invoice_receipts" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'itcycle',
    "supplier_invoice_number" TEXT NOT NULL,
    "supplier_cufe" TEXT NOT NULL,
    "supplier_issued_at" TIMESTAMP(3),
    "acuse_status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
    "acuse_external_id" TEXT,
    "acuse_sent_at" TIMESTAMP(3),
    "recepcion_status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
    "recepcion_external_id" TEXT,
    "recepcion_sent_at" TIMESTAMP(3),
    "aceptacion_expresa_status" "ElectronicInvoiceStatus",
    "aceptacion_expresa_external_id" TEXT,
    "aceptacion_expresa_sent_at" TIMESTAMP(3),
    "reclamo_status" "ElectronicInvoiceStatus",
    "reclamo_external_id" TEXT,
    "reclamo_sent_at" TIMESTAMP(3),
    "reclamo_reason" TEXT,
    "tacita_deadline_at" TIMESTAMP(3),
    "tacita_applied_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "received_invoice_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "received_invoice_receipts_purchase_id_key" ON "received_invoice_receipts"("purchase_id");
CREATE INDEX "received_invoice_receipts_company_id_created_at_idx" ON "received_invoice_receipts"("company_id", "created_at");
CREATE INDEX "received_invoice_receipts_tacita_deadline_at_idx" ON "received_invoice_receipts"("tacita_deadline_at");

ALTER TABLE "received_invoice_receipts" ADD CONSTRAINT "received_invoice_receipts_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "received_invoice_receipts" ADD CONSTRAINT "received_invoice_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "received_invoice_receipts" ADD CONSTRAINT "received_invoice_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "received_invoice_receipt_events" (
    "id" TEXT NOT NULL,
    "received_invoice_receipt_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "ElectronicInvoiceStatus",
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "received_invoice_receipt_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "received_invoice_receipt_events_received_invoice_receipt_id_c" ON "received_invoice_receipt_events"("received_invoice_receipt_id", "created_at");

ALTER TABLE "received_invoice_receipt_events" ADD CONSTRAINT "received_invoice_receipt_events_received_invoice_receipt_fkey" FOREIGN KEY ("received_invoice_receipt_id") REFERENCES "received_invoice_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
