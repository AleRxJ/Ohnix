CREATE TYPE "AccountingThirdPartyType" AS ENUM ('customer', 'supplier', 'other');

ALTER TABLE "journal_entry_lines"
  ADD COLUMN "third_party_type" "AccountingThirdPartyType",
  ADD COLUMN "third_party_id" TEXT,
  ADD COLUMN "third_party_name" TEXT,
  ADD COLUMN "third_party_document" TEXT;

CREATE INDEX "journal_entry_lines_third_party_type_third_party_id_idx"
  ON "journal_entry_lines"("third_party_type", "third_party_id");

ALTER TABLE "manual_journal_voucher_lines"
  ADD COLUMN "third_party_type" "AccountingThirdPartyType",
  ADD COLUMN "third_party_id" TEXT,
  ADD COLUMN "third_party_name" TEXT,
  ADD COLUMN "third_party_document" TEXT;

CREATE INDEX "manual_journal_voucher_lines_third_party_type_third_party_id_idx"
  ON "manual_journal_voucher_lines"("third_party_type", "third_party_id");

UPDATE "journal_entry_lines" jel
SET third_party_type = 'customer',
    third_party_id = c.id,
    third_party_name = c.name,
    third_party_document = c.identification
FROM journal_entries je
JOIN orders o ON (
  (je.source_type IN ('order_sale', 'order_cancellation', 'order_return') AND je.source_id = o.id)
  OR (je.source_type = 'order_payment' AND EXISTS (
      SELECT 1 FROM order_payments op WHERE op.id = je.source_id AND op.order_id = o.id
  ))
)
JOIN customers c ON c.id = o.customer_id
WHERE jel.journal_entry_id = je.id
  AND jel.chart_account_id IN (SELECT id FROM chart_accounts WHERE code = '1305');

UPDATE "journal_entry_lines" jel
SET third_party_type = 'supplier',
    third_party_id = s.id,
    third_party_name = s.name,
    third_party_document = s.identification
FROM journal_entries je
JOIN purchases p ON (
  (je.source_type IN ('purchase', 'purchase_return') AND je.source_id = p.id)
  OR (je.source_type = 'purchase_payment' AND EXISTS (
      SELECT 1 FROM purchase_payments pp WHERE pp.id = je.source_id AND pp.purchase_id = p.id
  ))
)
JOIN suppliers s ON s.id = p.supplier_id
WHERE jel.journal_entry_id = je.id
  AND jel.chart_account_id IN (SELECT id FROM chart_accounts WHERE code = '2205');

UPDATE "journal_entry_lines" jel
SET third_party_type = 'customer',
    third_party_id = c.id,
    third_party_name = c.name,
    third_party_document = c.identification
FROM journal_entries je
JOIN electronic_credit_notes ecn ON ecn.id = je.source_id
JOIN electronic_invoices ei ON ei.id = ecn.invoice_id
JOIN orders o ON o.id = ei.order_id
JOIN customers c ON c.id = o.customer_id
WHERE jel.journal_entry_id = je.id
  AND je.source_type IN ('credit_note_restock', 'credit_note_financial')
  AND jel.chart_account_id IN (SELECT id FROM chart_accounts WHERE code = '1305');
