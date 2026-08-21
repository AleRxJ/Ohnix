-- Points of Sale foundation (Escala plan).
--
-- Hand-written (not `prisma migrate dev`) because this environment's
-- DATABASE_URL is a pgbouncer-pooled Neon connection with no shadow
-- database configured, and `prisma migrate dev`'s own shadow-DB replay
-- already fails on an older migration in this project's history
-- (20260804000000_factus_v2_electronic_invoicing -> P1014, unrelated to
-- this change). The DDL below was generated with
-- `prisma migrate diff --from-url ... --to-schema-datamodel ... --script`
-- against the live database and is byte-for-byte what Prisma itself would
-- emit for the new tables/columns - the backfill blocks (steps 2, 3, 5)
-- are the only hand-added part, needed because `orders`/`purchases`/
-- `stock_movements` are non-empty tables and point_of_sale_id is NOT NULL.
--
-- Every account (a team owner, or a solo/independent user - see
-- teamContext.js#resolveAccountScope) gets exactly one default
-- PointOfSale, so this migration is a pure expand: no existing behavior
-- changes, nothing becomes inaccessible, every account just gained one
-- implicit "Principal" location that all of its historical data now
-- points to.

-- ── Step 1: create points_of_sale ───────────────────────────────────────
CREATE TABLE "points_of_sale" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_of_sale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "points_of_sale_account_id_is_active_idx" ON "points_of_sale"("account_id", "is_active");

-- ── Step 2: seed one default PointOfSale per current account root ──────
-- An "account root" is a user who is not currently an active team member
-- (i.e. a team owner, or a solo user) - the same population
-- resolveAccountScope resolves accountId to. cuid()-shaped ids aren't
-- available in plain SQL, so these use a "pos_" + md5 fallback id instead;
-- nothing in the app validates id format, only that it's a unique TEXT pk.
INSERT INTO "points_of_sale" ("id", "account_id", "name", "is_default", "is_active", "created_at", "updated_at")
SELECT
    'pos_' || substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 20),
    u."id",
    'Principal',
    true,
    true,
    now(),
    now()
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "team_members" tm WHERE tm."user_id" = u."id" AND tm."status" = 'active'
);

-- ── Step 3: safety net for historical account ids with no owner match ──
-- Covers edge cases (e.g. a past ownership transfer) where an account id
-- referenced by old data no longer corresponds to a current non-member
-- user. Without this, step 5's backfill could leave a stray row with no
-- default PointOfSale to point to, and step 6's NOT NULL would fail.
INSERT INTO "points_of_sale" ("id", "account_id", "name", "is_default", "is_active", "created_at", "updated_at")
SELECT
    'pos_' || substr(md5(random()::text || clock_timestamp()::text || acc."account_id"), 1, 20),
    acc."account_id",
    'Principal',
    true,
    true,
    now(),
    now()
FROM (
    SELECT DISTINCT "created_by" AS "account_id" FROM "orders"
    UNION
    SELECT DISTINCT "created_by" FROM "purchases"
    UNION
    SELECT DISTINCT "account_id" FROM "stock_movements"
) acc
WHERE NOT EXISTS (
    SELECT 1 FROM "points_of_sale" pos WHERE pos."account_id" = acc."account_id"
);

-- ── Step 4: add point_of_sale_id nullable (expand) ──────────────────────
ALTER TABLE "orders" ADD COLUMN "point_of_sale_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN "point_of_sale_id" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "point_of_sale_id" TEXT;

-- ── Step 5: backfill from each row's existing account scope ────────────
-- orders.created_by / purchases.created_by are already the resolved
-- accountId (never the acting team member's own id - see
-- teamContext.js), and stock_movements.account_id is explicitly that same
-- scope. So every row's default PointOfSale is just "the one owned by
-- that same account id".
UPDATE "orders" o
SET "point_of_sale_id" = pos."id"
FROM "points_of_sale" pos
WHERE pos."account_id" = o."created_by" AND pos."is_default" = true;

UPDATE "purchases" p
SET "point_of_sale_id" = pos."id"
FROM "points_of_sale" pos
WHERE pos."account_id" = p."created_by" AND pos."is_default" = true;

UPDATE "stock_movements" sm
SET "point_of_sale_id" = pos."id"
FROM "points_of_sale" pos
WHERE pos."account_id" = sm."account_id" AND pos."is_default" = true;

-- ── Step 6: contract - enforce NOT NULL now that every row has a value ─
ALTER TABLE "orders" ALTER COLUMN "point_of_sale_id" SET NOT NULL;
ALTER TABLE "purchases" ALTER COLUMN "point_of_sale_id" SET NOT NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "point_of_sale_id" SET NOT NULL;

CREATE INDEX "orders_point_of_sale_id_idx" ON "orders"("point_of_sale_id");
CREATE INDEX "purchases_point_of_sale_id_idx" ON "purchases"("point_of_sale_id");
CREATE INDEX "stock_movements_point_of_sale_id_created_at_idx" ON "stock_movements"("point_of_sale_id", "created_at");

ALTER TABLE "orders" ADD CONSTRAINT "orders_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- points_of_sale.account_id -> users.id (added after the backfill so the
-- inserts above aren't slowed down validating a constraint row-by-row).
ALTER TABLE "points_of_sale" ADD CONSTRAINT "points_of_sale_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Step 7: per-member scope (defaults to full access - see TeamMember.scopeAll) ──
ALTER TABLE "team_members" ADD COLUMN "scope_all" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "team_member_points_of_sale" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "point_of_sale_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_points_of_sale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "team_member_points_of_sale_point_of_sale_id_idx" ON "team_member_points_of_sale"("point_of_sale_id");
CREATE UNIQUE INDEX "team_member_points_of_sale_team_member_id_point_of_sale_id_key" ON "team_member_points_of_sale"("team_member_id", "point_of_sale_id");

ALTER TABLE "team_member_points_of_sale" ADD CONSTRAINT "team_member_points_of_sale_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_member_points_of_sale" ADD CONSTRAINT "team_member_points_of_sale_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
