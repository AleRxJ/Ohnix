-- Per-product configurable low-stock threshold (Escala+ plan feature).
ALTER TABLE "products"
  ADD COLUMN "low_stock_threshold" INTEGER;

-- Order PDF branding (Negocio+: logo + legal data; Escala+: custom footer).
ALTER TABLE "companies"
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "pdf_footer_text" TEXT;

-- Public API keys (Escala+ plan feature).
CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "requests_today" INTEGER NOT NULL DEFAULT 0,
  "requests_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "api_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
