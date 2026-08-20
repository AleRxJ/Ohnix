-- Distinguishes a sandbox/test payment from a real one in the admin
-- payments ledger (AdminPayments.jsx). Nullable, no default: every existing
-- row predates this tracking and its true test/live status was never
-- recorded anywhere, so defaulting it to false would falsely claim those
-- were all real charges. Populated explicitly going forward - see
-- handleEpaycoConfirmation / resolvePendingPaymentStatus (ePayco's own
-- x_test_request flag) and the Stripe webhook handler (session.livemode).
ALTER TABLE "plan_upgrade_requests"
  ADD COLUMN "is_test_payment" BOOLEAN;
