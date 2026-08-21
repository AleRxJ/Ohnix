-- Fase 3: issuing an electronic-invoice credit note with a conceptCode that
-- represents goods actually coming back ("partial_return"/"cancellation")
-- now automatically restocks - see
-- electronicInvoicing.service.js#issueCreditNoteForInvoice. sourceId on
-- these movements is the ElectronicCreditNote's id, not the order's.
ALTER TYPE "StockMovementSourceType" ADD VALUE 'credit_note_restock';
