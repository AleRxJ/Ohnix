-- Factus V2 / DIAN electronic invoicing. Generated from the configured PostgreSQL schema.
CREATE TYPE "ElectronicInvoiceStatus" AS ENUM ('draft', 'issuing', 'submitted', 'accepted', 'rejected', 'error', 'cancelled');

ALTER TABLE "companies"
  ADD COLUMN "country_code" TEXT,
  ADD COLUMN "electronic_invoicing_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "factus_document_type" TEXT NOT NULL DEFAULT '01',
  ADD COLUMN "factus_numbering_range_id" TEXT,
  ADD COLUMN "factus_operation_type" TEXT NOT NULL DEFAULT '10',
  ADD COLUMN "factus_payment_form" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN "factus_payment_method_code" TEXT NOT NULL DEFAULT '42';

ALTER TABLE "customers"
  ADD COLUMN "country_code" TEXT,
  ADD COLUMN "identification" TEXT,
  ADD COLUMN "identification_document_code" TEXT,
  ADD COLUMN "legal_organization_code" TEXT,
  ADD COLUMN "municipality_code" TEXT,
  ADD COLUMN "tribute_code" TEXT;

ALTER TABLE "products"
  ADD COLUMN "is_tax_excluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "standard_code" TEXT NOT NULL DEFAULT '999',
  ADD COLUMN "tax_code" TEXT DEFAULT '01',
  ADD COLUMN "tax_rate" DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN "unit_measure_code" TEXT NOT NULL DEFAULT '94';

CREATE TABLE "electronic_invoices" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "country_code" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
  "external_id" TEXT,
  "reference_code" TEXT NOT NULL,
  "invoice_number" TEXT,
  "cufe" TEXT,
  "qr_url" TEXT,
  "pdf_url" TEXT,
  "xml_url" TEXT,
  "raw_request" JSONB,
  "raw_response" JSONB,
  "fiscal_snapshot" JSONB,
  "error_message" TEXT,
  "issued_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "electronic_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "electronic_invoice_events" (
  "id" TEXT NOT NULL,
  "electronic_invoice_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "ElectronicInvoiceStatus",
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "electronic_invoice_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "electronic_invoices_order_id_key" ON "electronic_invoices"("order_id");
CREATE UNIQUE INDEX "electronic_invoices_external_id_key" ON "electronic_invoices"("external_id");
CREATE UNIQUE INDEX "electronic_invoices_reference_code_key" ON "electronic_invoices"("reference_code");
CREATE INDEX "electronic_invoices_company_id_created_at_idx" ON "electronic_invoices"("company_id", "created_at");
CREATE INDEX "electronic_invoices_country_code_provider_idx" ON "electronic_invoices"("country_code", "provider");
CREATE INDEX "electronic_invoice_events_electronic_invoice_id_created_at_idx" ON "electronic_invoice_events"("electronic_invoice_id", "created_at");

ALTER TABLE "electronic_invoices"
  ADD CONSTRAINT "electronic_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "electronic_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "electronic_invoice_events"
  ADD CONSTRAINT "electronic_invoice_events_electronic_invoice_id_fkey" FOREIGN KEY ("electronic_invoice_id") REFERENCES "electronic_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
