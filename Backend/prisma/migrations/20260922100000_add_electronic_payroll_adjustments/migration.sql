CREATE TABLE "electronic_payroll_adjustments" (
    "id" TEXT NOT NULL,
    "electronic_payroll_document_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'itcycle',
    "adjustment_type" TEXT NOT NULL,
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
    CONSTRAINT "electronic_payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "electronic_payroll_adjustments_external_id_key" ON "electronic_payroll_adjustments"("external_id");
CREATE UNIQUE INDEX "electronic_payroll_adjustments_reference_code_key" ON "electronic_payroll_adjustments"("reference_code");
CREATE INDEX "electronic_payroll_adjustments_epd_id_created_at_idx" ON "electronic_payroll_adjustments"("electronic_payroll_document_id", "created_at");
CREATE INDEX "electronic_payroll_adjustments_company_id_created_at_idx" ON "electronic_payroll_adjustments"("company_id", "created_at");

ALTER TABLE "electronic_payroll_adjustments"
  ADD CONSTRAINT "electronic_payroll_adjustments_epd_id_fkey" FOREIGN KEY ("electronic_payroll_document_id") REFERENCES "electronic_payroll_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "electronic_payroll_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
