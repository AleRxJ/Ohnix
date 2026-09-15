CREATE TABLE "external_api_clients" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "tax_identification" TEXT NOT NULL,
    "tax_identification_dv" TEXT NOT NULL,
    "person_type" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "itcycle_company_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "external_api_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_api_clients_itcycle_company_id_key" ON "external_api_clients"("itcycle_company_id");
ALTER TABLE "external_api_clients" ADD CONSTRAINT "external_api_clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "external_api_client_key_issuances" (
    "id" TEXT NOT NULL,
    "external_api_client_id" TEXT NOT NULL,
    "label" TEXT,
    "issued_by_user_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_api_client_key_issuances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_api_client_key_issuances_external_api_client_id_idx" ON "external_api_client_key_issuances"("external_api_client_id");
ALTER TABLE "external_api_client_key_issuances" ADD CONSTRAINT "external_api_client_key_issuances_external_api_client_id_fkey" FOREIGN KEY ("external_api_client_id") REFERENCES "external_api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_api_client_key_issuances" ADD CONSTRAINT "external_api_client_key_issuances_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
