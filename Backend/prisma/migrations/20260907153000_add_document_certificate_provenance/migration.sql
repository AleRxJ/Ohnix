-- AlterTable
ALTER TABLE "electronic_invoices" ADD COLUMN "certificate_id" TEXT,
ADD COLUMN "certificate_provider" TEXT;

-- AlterTable
ALTER TABLE "electronic_credit_notes" ADD COLUMN "certificate_id" TEXT,
ADD COLUMN "certificate_provider" TEXT;

-- AlterTable
ALTER TABLE "purchase_support_documents" ADD COLUMN "certificate_id" TEXT,
ADD COLUMN "certificate_provider" TEXT;
