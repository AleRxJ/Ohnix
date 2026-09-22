-- Tracks the last time an admin sent an "also try full Ohnix" invitation
-- email to an external API client (see ExternalApiClient.upsellEmailSentAt
-- in schema.prisma) - admin-triggered only, never automatic.
ALTER TABLE "external_api_clients" ADD COLUMN "upsell_email_sent_at" TIMESTAMP(3);
