DROP INDEX IF EXISTS "journal_entries_single_source_key";

CREATE UNIQUE INDEX "journal_entries_single_source_key"
ON "journal_entries" ("source_type", "source_id")
WHERE "source_id" IS NOT NULL
  AND "source_type" IN (
    'order_sale', 'purchase', 'order_payment', 'purchase_payment',
    'order_cancellation', 'credit_note_restock', 'credit_note_financial',
    'period_close', 'inventory_adjustment', 'transfer_discrepancy',
    'manual_journal', 'manual_journal_reversal'
  );
