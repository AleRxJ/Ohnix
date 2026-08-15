-- VAT (IVA) architecture, phase 1+2 (see docs/artifact "El IVA en Ohnix"):
--   1. companies.vat_responsible - whether the company is responsable / no
--      responsable de IVA (Estatuto Tributario art. 437). Defaults to
--      'unset', never 'responsible' - electronicInvoicing.service.js refuses
--      to submit a DIAN document while a company is 'unset'.
--   2. products.tax_treatment replaces products.is_tax_excluded - a boolean
--      can't distinguish "excluido" (ET art. 424/476, no input-VAT credit)
--      from "exento" (ET art. 477/478/481, 0% rate, input-VAT credit
--      allowed). Existing excluded products are backfilled to 'excluded';
--      nothing is auto-promoted to 'exempt' since that requires a deliberate
--      classification the old boolean never captured.

CREATE TYPE "VatResponsibility" AS ENUM ('unset', 'responsible', 'not_responsible');
CREATE TYPE "ProductTaxTreatment" AS ENUM ('taxed', 'excluded', 'exempt');

ALTER TABLE "companies"
  ADD COLUMN "vat_responsible" "VatResponsibility" NOT NULL DEFAULT 'unset',
  ADD COLUMN "vat_responsible_effective_from" TIMESTAMP(3);

ALTER TABLE "products"
  ADD COLUMN "tax_treatment" "ProductTaxTreatment" NOT NULL DEFAULT 'taxed';

UPDATE "products" SET "tax_treatment" = 'excluded' WHERE "is_tax_excluded" = true;

ALTER TABLE "products" DROP COLUMN "is_tax_excluded";
