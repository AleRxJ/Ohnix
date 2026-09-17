CREATE TABLE "electronic_payroll_documents" (
    "id" TEXT NOT NULL,
    "payroll_document_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'itcycle',
    "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
    "external_id" TEXT,
    "reference_code" TEXT NOT NULL,
    "document_number" TEXT,
    "cune" TEXT,
    "raw_request" JSONB,
    "raw_response" JSONB,
    "error_message" TEXT,
    "certificate_id" TEXT,
    "certificate_provider" TEXT,
    "certificate_identifier" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "electronic_payroll_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "electronic_payroll_document_events" (
    "id" TEXT NOT NULL,
    "electronic_payroll_document_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "ElectronicInvoiceStatus",
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "electronic_payroll_document_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "electronic_payroll_documents_payroll_document_id_key" ON "electronic_payroll_documents"("payroll_document_id");
CREATE UNIQUE INDEX "electronic_payroll_documents_external_id_key" ON "electronic_payroll_documents"("external_id");
CREATE UNIQUE INDEX "electronic_payroll_documents_reference_code_key" ON "electronic_payroll_documents"("reference_code");
CREATE INDEX "electronic_payroll_documents_company_id_created_at_idx" ON "electronic_payroll_documents"("company_id", "created_at");
CREATE INDEX "electronic_payroll_document_events_epd_id_created_at_idx" ON "electronic_payroll_document_events"("electronic_payroll_document_id", "created_at");

ALTER TABLE "electronic_payroll_documents"
  ADD CONSTRAINT "electronic_payroll_documents_payroll_document_id_fkey" FOREIGN KEY ("payroll_document_id") REFERENCES "payroll_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "electronic_payroll_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "electronic_payroll_document_events"
  ADD CONSTRAINT "electronic_payroll_document_events_epd_id_fkey" FOREIGN KEY ("electronic_payroll_document_id") REFERENCES "electronic_payroll_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
