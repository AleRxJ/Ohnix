-- Roles & permissions regrouping (2026-09-28). Nobody's effective access
-- changes: every new module key starts at the level the role already had
-- on the module it was split out of, and the new capabilities start ON for
-- every role that existed before this migration.
--
--   einvoicing  <- orders   (sales e-invoices + credit notes)
--   inventory   <- products (adjustments, transfers, production)
--   discoveries <- reports  (Discovery Engine)
--   team        =  none     (new: delegated team management)

INSERT INTO "team_role_permissions" ("id", "role_id", "module_key", "level")
SELECT gen_random_uuid()::text, p."role_id", m.new_key, p."level"
FROM "team_role_permissions" p
JOIN (VALUES ('orders', 'einvoicing'), ('products', 'inventory'), ('reports', 'discoveries')) AS m(old_key, new_key)
  ON p."module_key" = m.old_key
ON CONFLICT ("role_id", "module_key") DO NOTHING;

-- Owner roles hold "admin" on everything (the owner is exempt from checks
-- anyway, this just keeps the rows consistent with OWNER_ROLE_PERMISSIONS).
INSERT INTO "team_role_permissions" ("id", "role_id", "module_key", "level")
SELECT gen_random_uuid()::text, r."id", 'team', 'admin'
FROM "team_roles" r
WHERE r."is_owner_role" = true
ON CONFLICT ("role_id", "module_key") DO NOTHING;

UPDATE "team_roles"
SET "capabilities" = "capabilities" || '{"deleteRecords": true, "processReturns": true, "reportsExport": true}'::jsonb
WHERE "is_owner_role" = false;
