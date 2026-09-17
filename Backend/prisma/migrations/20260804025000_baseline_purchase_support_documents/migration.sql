-- Baseline catch-up: "purchase_support_documents" and
-- "purchase_support_document_events" exist in the real database but were
-- never captured by any tracked migration, and (unlike the other baseline
-- catch-ups in this history) are never ALTERed by any later migration
-- either - their current schema.prisma definition IS their original one, so
-- this uses it directly rather than reconstructing an earlier state.
-- Placed after 20260804000000_factus_v2_electronic_invoicing, whose
-- "ElectronicInvoiceStatus" enum this table's status column depends on.
-- Metadata-only for local shadow-database replay - never run against the
-- real database, which already has these tables.
CREATE TABLE "purchase_support_documents" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'itcycle',
    "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
    "external_id" TEXT,
    "reference_code" TEXT NOT NULL,
    "document_number" TEXT,
    "cufe" TEXT,
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "raw_request" JSONB,
    "raw_response" JSONB,
    "fiscal_snapshot" JSONB,
    "error_message" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_support_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_support_documents_purchase_id_key" ON "purchase_support_documents"("purchase_id");

CREATE UNIQUE INDEX "purchase_support_documents_external_id_key" ON "purchase_support_documents"("external_id");

CREATE UNIQUE INDEX "purchase_support_documents_reference_code_key" ON "purchase_support_documents"("reference_code");

CREATE INDEX "purchase_support_documents_company_id_created_at_idx" ON "purchase_support_documents"("company_id", "created_at");

ALTER TABLE "purchase_support_documents" ADD CONSTRAINT "purchase_support_documents_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_support_documents" ADD CONSTRAINT "purchase_support_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "purchase_support_document_events" (
    "id" TEXT NOT NULL,
    "purchase_support_document_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "ElectronicInvoiceStatus",
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_support_document_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_support_document_events_purchase_support_document__idx" ON "purchase_support_document_events"("purchase_support_document_id", "created_at");

ALTER TABLE "purchase_support_document_events" ADD CONSTRAINT "purchase_support_document_events_purchase_support_document_fkey" FOREIGN KEY ("purchase_support_document_id") REFERENCES "purchase_support_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
