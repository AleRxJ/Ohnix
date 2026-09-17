CREATE TABLE "accounting_config_audits" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_config_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_config_audits_account_id_entity_type_entity_id_created_at_idx" ON "accounting_config_audits"("account_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "accounting_config_audits_actor_id_created_at_idx" ON "accounting_config_audits"("actor_id", "created_at");
ALTER TABLE "accounting_config_audits" ADD CONSTRAINT "accounting_config_audits_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_config_audits" ADD CONSTRAINT "accounting_config_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
