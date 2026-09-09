-- AlterTable
ALTER TABLE "electronic_invoices" ADD COLUMN "certificate_identifier" TEXT;

-- AlterTable
ALTER TABLE "electronic_credit_notes" ADD COLUMN "certificate_identifier" TEXT;

-- AlterTable
ALTER TABLE "purchase_support_documents" ADD COLUMN "certificate_identifier" TEXT;

-- AlterTable
ALTER TABLE "dian_test_matrix_documents" ADD COLUMN "certificate_identifier" TEXT;
