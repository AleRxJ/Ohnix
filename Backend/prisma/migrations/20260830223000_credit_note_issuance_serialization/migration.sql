-- At most one fiscal credit note may be in flight for an invoice. Without
-- this database-level claim, two concurrent requests can both validate the
-- same remaining balance before either provider response is persisted.
CREATE UNIQUE INDEX "electronic_credit_notes_one_in_flight_per_invoice"
  ON "electronic_credit_notes" ("invoice_id")
  WHERE "status" IN ('issuing', 'submitted');
