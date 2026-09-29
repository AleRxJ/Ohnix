-- Per-sale DIAN issuance choice ("Emitir ahora" / "Emitir después").
-- Existing companies get 'ask', whose preselected option is "Emitir ahora",
-- so nothing changes until a seller explicitly defers a sale.

-- CreateEnum
CREATE TYPE "EinvoiceIssueMode" AS ENUM ('automatic', 'ask');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "einvoice_issue_mode" "EinvoiceIssueMode" NOT NULL DEFAULT 'ask';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "einvoice_defer_reason" TEXT,
ADD COLUMN     "einvoice_deferred_at" TIMESTAMP(3),
ADD COLUMN     "einvoice_deferred_by" TEXT;

