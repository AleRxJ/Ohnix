-- Physical characteristics of a product (weight, dimensions, packaging) -
-- the data a future logistics-carrier integration needs to quote and
-- generate a shipping label without ever having to redesign the product
-- model. See the schema comments on Product/OrderDetail for the full
-- rationale.
--
-- Weight is always stored in grams and dimensions in centimeters
-- regardless of which unit the seller entered them in - weight_unit/
-- dimension_unit are display preferences only, converted by
-- product.controller.js on the way in/out, never used in any calculation.
--
-- isPhysical defaults true so every existing product stays valid as-is;
-- the rest of the physical block stays nullable so a backfill isn't
-- required (a pre-existing product is simply "physical, characteristics
-- not filled in yet" until its owner edits it).

CREATE TYPE "WeightUnit" AS ENUM ('g', 'kg');
CREATE TYPE "DimensionUnit" AS ENUM ('cm', 'm');
CREATE TYPE "PackagingType" AS ENUM ('box', 'envelope', 'bag', 'tube', 'pallet');

ALTER TABLE "products"
  ADD COLUMN "is_physical" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "weight_value" DECIMAL(10,2),
  ADD COLUMN "weight_unit" "WeightUnit" NOT NULL DEFAULT 'g',
  ADD COLUMN "height_value" DECIMAL(10,2),
  ADD COLUMN "width_value" DECIMAL(10,2),
  ADD COLUMN "length_value" DECIMAL(10,2),
  ADD COLUMN "dimension_unit" "DimensionUnit" NOT NULL DEFAULT 'cm',
  ADD COLUMN "volumetric_weight" DECIMAL(10,2),
  ADD COLUMN "units_per_package" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "packaging_type" "PackagingType" NOT NULL DEFAULT 'box',
  ADD COLUMN "is_fragile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "package_weight_value" DECIMAL(10,2),
  ADD COLUMN "package_height_value" DECIMAL(10,2),
  ADD COLUMN "package_width_value" DECIMAL(10,2),
  ADD COLUMN "package_length_value" DECIMAL(10,2);

-- Snapshot of the per-unit weight/volumetric weight actually sold on each
-- order line, same freezing pattern as tax_rate_applied - see the schema
-- comment on OrderDetail.
ALTER TABLE "order_details"
  ADD COLUMN "weight_applied" DECIMAL(10,2),
  ADD COLUMN "volumetric_weight_applied" DECIMAL(10,2);
