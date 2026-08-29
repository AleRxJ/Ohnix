-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "firmapass_validation_uuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_firmapass_validation_uuid_key" ON "companies"("firmapass_validation_uuid");
