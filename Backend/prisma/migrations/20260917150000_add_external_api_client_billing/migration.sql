ALTER TABLE "external_api_clients" ADD COLUMN     "epayco_customer_id" TEXT,
ADD COLUMN     "epayco_token_card" TEXT,
ADD COLUMN     "billing_enrolled_at" TIMESTAMP(3),
ADD COLUMN     "billing_enrollment_token" TEXT,
ADD COLUMN     "billing_enrollment_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "annual_period_starts_at" TIMESTAMP(3),
ADD COLUMN     "annual_period_ends_at" TIMESTAMP(3),
ADD COLUMN     "annual_docs_included" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "annual_base_amount_cop" INTEGER NOT NULL DEFAULT 310000,
ADD COLUMN     "cumulative_docs_this_period" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "billing_at_risk" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "external_api_clients_billing_enrollment_token_key" ON "external_api_clients"("billing_enrollment_token");

CREATE TABLE "external_api_client_charges" (
    "id" TEXT NOT NULL,
    "external_api_client_id" TEXT NOT NULL,
    "charge_type" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER,
    "documents_charged" INTEGER,
    "amount_cop" INTEGER NOT NULL,
    "epayco_ref" TEXT,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "charged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_api_client_charges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_api_client_charges_external_api_client_id_idx" ON "external_api_client_charges"("external_api_client_id");
ALTER TABLE "external_api_client_charges" ADD CONSTRAINT "external_api_client_charges_external_api_client_id_fkey" FOREIGN KEY ("external_api_client_id") REFERENCES "external_api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
