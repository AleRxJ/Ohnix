-- Cancel-without-cutting-paid-access (subscription.controller.js cancelMySubscription):
-- lets a canceled subscription stay status=active/endsAt untouched until the
-- period the user already paid for actually ends.
ALTER TABLE "subscriptions" ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

-- Access-token revocation (auth.middleware.js verifyJWT): bumped on password
-- change/reset to invalidate every access token issued before that point.
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- Postgres does not auto-index foreign key columns (unlike MySQL) - these
-- cover every createdById/customerId/categoryId/etc. filter used by the
-- per-user scoped list/report endpoints across the app.
CREATE INDEX "categories_created_by_idx" ON "categories"("created_by");

CREATE INDEX "customers_created_by_idx" ON "customers"("created_by");

CREATE INDEX "order_details_order_id_idx" ON "order_details"("order_id");

CREATE INDEX "order_details_product_id_idx" ON "order_details"("product_id");

CREATE INDEX "orders_created_by_idx" ON "orders"("created_by");

CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

CREATE INDEX "products_created_by_idx" ON "products"("created_by");

CREATE INDEX "products_category_id_idx" ON "products"("category_id");

CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");

CREATE INDEX "purchase_details_purchase_id_idx" ON "purchase_details"("purchase_id");

CREATE INDEX "purchase_details_product_id_idx" ON "purchase_details"("product_id");

CREATE INDEX "purchases_created_by_idx" ON "purchases"("created_by");

CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

CREATE INDEX "suppliers_created_by_idx" ON "suppliers"("created_by");

CREATE INDEX "units_created_by_idx" ON "units"("created_by");
