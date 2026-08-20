-- Account-wide low-stock alert threshold, sitting between the per-product
-- override (products.low_stock_threshold) and the platform-wide default
-- (system_settings.low_stock_default_threshold). Null means "no account
-- override, fall back to the platform default". See lowStockScheduler.js#getLowStockProductsForUser.
ALTER TABLE "subscriptions" ADD COLUMN "low_stock_threshold" INTEGER;
