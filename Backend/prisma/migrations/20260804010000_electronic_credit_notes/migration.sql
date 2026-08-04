-- Electronic credit notes for accepted Factus/DIAN invoices.
CREATE TABLE "electronic_credit_notes" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "correction_concept_code" TEXT NOT NULL,
  "reference_code" TEXT NOT NULL,
  "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'draft',
  "external_id" TEXT,
  "credit_note_number" TEXT,
  "cufe" TEXT,
  "pdf_url" TEXT,
  "xml_url" TEXT,
  "observation" TEXT,
  "raw_request" JSONB,
  "raw_response" JSONB,
  "error_message" TEXT,
  "issued_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "electronic_credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "electronic_credit_notes_reference_code_key" ON "electronic_credit_notes"("reference_code");
CREATE UNIQUE INDEX "electronic_credit_notes_external_id_key" ON "electronic_credit_notes"("external_id");
CREATE INDEX "electronic_credit_notes_invoice_id_created_at_idx" ON "electronic_credit_notes"("invoice_id", "created_at");

ALTER TABLE "electronic_credit_notes"
  ADD CONSTRAINT "electronic_credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "electronic_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
