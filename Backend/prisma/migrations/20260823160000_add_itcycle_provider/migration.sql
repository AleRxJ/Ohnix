-- AlterEnum
ALTER TYPE "ElectronicInvoiceStatus" ADD VALUE 'contingency';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "itcycle_api_key_ciphertext" TEXT,
ADD COLUMN     "itcycle_company_id" TEXT;
