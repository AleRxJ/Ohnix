-- One-to-one operational sources must never create duplicate journal entries.
-- Granular order_return/purchase_return sources are deliberately excluded:
-- multiple partial-return events legitimately share the same document id.
-- PostgreSQL partial indexes are not expressible in Prisma schema syntax, so
-- this invariant lives in the migration and is mirrored by
-- journalEntry.service.js#SINGLE_ENTRY_SOURCE_TYPES.
CREATE UNIQUE INDEX "journal_entries_single_source_key"
ON "journal_entries" ("source_type", "source_id")
WHERE "source_id" IS NOT NULL
  AND "source_type" IN (
    'order_sale',
    'purchase',
    'order_payment',
    'purchase_payment',
    'order_cancellation',
    'credit_note_restock',
    'credit_note_financial',
    'period_close'
  );
