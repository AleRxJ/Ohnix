-- Phase 3 ("El IVA en Ohnix" section 6/9): freeze the effective tax
-- treatment/rate/amount on each order line at the moment it's sold, so a
-- later edit to a product's tax classification (or a change in a company's
-- VAT responsibility) never retroactively rewrites the tax on an order
-- already placed. Every downstream reader (DIAN payload builders, credit
-- notes, VAT reports) reads these columns instead of re-deriving from the
-- live Product/Company.
ALTER TABLE "order_details"
  ADD COLUMN "tax_treatment_applied" "ProductTaxTreatment" NOT NULL DEFAULT 'taxed',
  ADD COLUMN "tax_rate_applied" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill: per-line tax was never tracked before this migration, so this
-- approximates each existing line's tax by prorating its parent order's
-- total gst proportionally to the line's share of the order subtotal. Exact
-- when every line in an order was taxed at the same rate (the common case);
-- an approximation for orders that mixed taxed/excluded/exempt lines, since
-- the original per-line split was never recorded.
UPDATE "order_details" od
SET
  "tax_rate_applied" = COALESCE(ROUND((o."gst" / NULLIF(o."sub_total", 0)) * 100, 2), 0),
  "tax_amount" = ROUND(od."total" * COALESCE((o."gst" / NULLIF(o."sub_total", 0)), 0), 2),
  "tax_treatment_applied" = CASE WHEN o."gst" > 0 THEN 'taxed'::"ProductTaxTreatment" ELSE 'excluded'::"ProductTaxTreatment" END
FROM "orders" o
WHERE od."order_id" = o."id";

-- Phase 4: Colombia VAT config (general rate - ET art. 468; art. 437 par. 3
-- UVT threshold; DIAN's yearly UVT peso value) as data instead of the
-- hardcoded constants they replace, since all three change by government
-- decree/resolution rather than by a code deploy.
ALTER TABLE "system_settings"
  ADD COLUMN "colombia_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 19,
  ADD COLUMN "colombia_vat_responsible_threshold_uvt" INTEGER NOT NULL DEFAULT 3500,
  ADD COLUMN "colombia_uvt_value" DECIMAL(12,2) NOT NULL DEFAULT 52374;
