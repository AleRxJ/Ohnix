-- Ohnix operates exclusively as DIAN software propio through itcycle-api-dian.
-- Provider fields on already-issued documents are intentionally preserved as
-- historical evidence. Company-level legacy routing is disabled.
UPDATE "companies"
SET
  "electronic_invoicing_enabled" = CASE
    WHEN "itcycle_company_id" IS NULL THEN FALSE
    ELSE "electronic_invoicing_enabled"
  END,
  "electronic_invoicing_provider" = 'itcycle'
WHERE "electronic_invoicing_provider" IS DISTINCT FROM 'itcycle';

ALTER TABLE "companies"
  ALTER COLUMN "electronic_invoicing_provider" SET DEFAULT 'itcycle';
