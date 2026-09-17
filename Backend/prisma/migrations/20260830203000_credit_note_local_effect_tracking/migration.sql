ALTER TABLE "electronic_credit_notes"
  -- Historical notes have no normalized replay payload, so presenting them
  -- as retryable would be unsafe. Only notes created by the new application
  -- code start as pending.
  ADD COLUMN "local_effect_status" TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN "local_effect_payload" JSONB,
  ADD COLUMN "local_effect_error" TEXT,
  ADD COLUMN "local_effect_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "local_effect_applied_at" TIMESTAMP(3);

ALTER TABLE "electronic_credit_notes"
  ALTER COLUMN "local_effect_status" SET DEFAULT 'pending';

ALTER TABLE "electronic_credit_notes"
  ADD CONSTRAINT "electronic_credit_notes_local_effect_status_check"
    CHECK ("local_effect_status" IN ('pending', 'failed', 'applied', 'not_applicable')),
  ADD CONSTRAINT "electronic_credit_notes_local_effect_attempts_check"
    CHECK ("local_effect_attempts" >= 0),
  ADD CONSTRAINT "electronic_credit_notes_local_effect_payload_kind_check"
    CHECK (
      "local_effect_payload" IS NULL
      OR "local_effect_payload"->>'kind' IN ('restock', 'financial')
    );

CREATE INDEX "electronic_credit_notes_local_effect_status_idx"
  ON "electronic_credit_notes" ("local_effect_status", "created_at");
