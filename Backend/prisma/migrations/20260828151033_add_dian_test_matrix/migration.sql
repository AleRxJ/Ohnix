-- CreateEnum
CREATE TYPE "DianTestMatrixRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DianTestMatrixDocumentType" AS ENUM ('invoice', 'creditNote', 'debitNote');

-- CreateEnum
CREATE TYPE "DianTestMatrixDocumentStatus" AS ENUM ('pending', 'sending', 'sent', 'accepted', 'rejected', 'error');

-- CreateTable
CREATE TABLE "dian_test_matrix_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "test_set_id" TEXT NOT NULL,
    "status" "DianTestMatrixRunStatus" NOT NULL DEFAULT 'pending',
    "invoice_target" INTEGER NOT NULL DEFAULT 30,
    "credit_note_target" INTEGER NOT NULL DEFAULT 10,
    "debit_note_target" INTEGER NOT NULL DEFAULT 10,
    "pass_result" BOOLEAN,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dian_test_matrix_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dian_test_matrix_documents" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "document_type" "DianTestMatrixDocumentType" NOT NULL,
    "reference_invoice_sequence" INTEGER,
    "internal_reference" TEXT NOT NULL,
    "external_id" TEXT,
    "status" "DianTestMatrixDocumentStatus" NOT NULL DEFAULT 'pending',
    "cufe" TEXT,
    "status_description" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dian_test_matrix_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dian_test_matrix_runs_company_id_created_at_idx" ON "dian_test_matrix_runs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "dian_test_matrix_runs_company_id_status_idx" ON "dian_test_matrix_runs"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dian_test_matrix_documents_internal_reference_key" ON "dian_test_matrix_documents"("internal_reference");

-- CreateIndex
CREATE INDEX "dian_test_matrix_documents_run_id_status_idx" ON "dian_test_matrix_documents"("run_id", "status");

-- CreateIndex
CREATE INDEX "dian_test_matrix_documents_run_id_document_type_idx" ON "dian_test_matrix_documents"("run_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "dian_test_matrix_documents_run_id_sequence_key" ON "dian_test_matrix_documents"("run_id", "sequence");

-- AddForeignKey
ALTER TABLE "dian_test_matrix_runs" ADD CONSTRAINT "dian_test_matrix_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dian_test_matrix_runs" ADD CONSTRAINT "dian_test_matrix_runs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dian_test_matrix_documents" ADD CONSTRAINT "dian_test_matrix_documents_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "dian_test_matrix_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

