-- Auto-renewal with a stored card (subscriptionAutoRenew.service.js)
ALTER TABLE "subscriptions"
  ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "auto_renew_consent_at" TIMESTAMP(3),
  ADD COLUMN "payment_provider" TEXT,
  ADD COLUMN "epayco_customer_id" TEXT,
  ADD COLUMN "epayco_token_card" TEXT,
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_payment_method_id" TEXT,
  ADD COLUMN "card_brand" TEXT,
  ADD COLUMN "card_last4" TEXT,
  ADD COLUMN "card_exp_month" INTEGER,
  ADD COLUMN "card_exp_year" INTEGER,
  ADD COLUMN "billing_doc_type" TEXT,
  ADD COLUMN "billing_doc_number" TEXT,
  ADD COLUMN "billing_holder_name" TEXT,
  ADD COLUMN "renewal_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_renewal_attempt_at" TIMESTAMP(3),
  ADD COLUMN "last_renewal_error" TEXT,
  ADD COLUMN "upcoming_charge_notice_for" TIMESTAMP(3);

ALTER TABLE "plan_upgrade_requests"
  ADD COLUMN "is_auto_charge" BOOLEAN NOT NULL DEFAULT false;
