-- Retenciones sufridas: customer payments (orderPayment.service.js) and
-- the ReteIVA they feed into the IVA settlement (vatSettlement.service.js)
ALTER TABLE "order_payments" ADD COLUMN     "withheld_ica" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withheld_income_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withheld_vat" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "vat_settlements" ADD COLUMN     "withheld_vat_applied" DECIMAL(14,2) NOT NULL DEFAULT 0;
