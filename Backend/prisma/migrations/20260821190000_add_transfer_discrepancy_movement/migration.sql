-- New StockMovement source type for the shortfall on a partial receive -
-- see the enum's own comment in schema.prisma. Safe in the same
-- transaction as everything else (PG 12+ only forbids using a freshly
-- added enum value within the transaction that added it - this server runs
-- PostgreSQL 18), same reasoning as the transfer_out/transfer_in addition
-- in the add_product_location_stock migration. Pure addition, no backfill:
-- nothing before this could have produced a transfer_discrepancy row.
ALTER TYPE "StockMovementSourceType" ADD VALUE 'transfer_discrepancy';
