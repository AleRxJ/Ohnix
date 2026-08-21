-- category.controller.js#updateCategory / unit.controller.js#updateUnit (and
-- their create counterparts) reject duplicate names with a plain
-- findFirst-then-write check, which two concurrent renames to the same name
-- can both pass under Read Committed. Verified no existing duplicates before
-- adding this (multi-user concurrency audit, 2026-08-20) - the controllers
-- keep their pre-check for a friendly error message, but this unique index
-- is what actually makes "only one wins" true, the same way
-- products_product_code_created_by_key already does for products.
CREATE UNIQUE INDEX "categories_category_name_created_by_key" ON "categories"("category_name", "created_by");

CREATE UNIQUE INDEX "units_unit_name_created_by_key" ON "units"("unit_name", "created_by");
