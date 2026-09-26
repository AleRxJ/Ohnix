-- Action-level role capabilities (Fase 3 of the roles & permissions audit).
-- New roles start with '{}' (every capability denied). Roles that already
-- exist keep today's behavior - free sale prices and visible costs - so no
-- member loses access on deploy; the owner can switch them off per role.
ALTER TABLE "team_roles" ADD COLUMN "capabilities" JSONB NOT NULL DEFAULT '{}';

UPDATE "team_roles"
SET "capabilities" = '{"salesPriceOverride": true, "salesMaxDiscountPct": 100, "catalogViewCosts": true}'::jsonb
WHERE "is_owner_role" = false;
