import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { prisma } from "../db/prisma.js";
import { normalizeCountryCode } from "../services/companyCountry.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { recordStockMovement } from "../services/stockMovement.service.js";
import { postInventoryAdjustmentJournalEntry } from "../services/accountingPosting.service.js";
import {
    claimLocationStockWithCost,
    creditLocationStockWithCost,
    getLocationStockSummary,
    scopedStockForProducts,
    sellableStockAtLocation,
} from "../services/productLocationStock.service.js";
import { quickTransfer } from "../services/stockTransfer.service.js";
import { creditBatch, claimBatchesFEFO, listBatches } from "../services/productBatch.service.js";
import { mapStockTransfer } from "./stockTransfer.controller.js";
import { isForeignKeyRestrictError } from "../utils/prismaErrors.js";
import { getColombiaTaxSettings } from "../utils/systemSettings.js";
import { emitAccountEvent, emitPosEvent } from "../live/dataEvents.js";
import { enqueueWebhookEvent } from "../services/webhookDispatch.service.js";
import { updateWithConflictCheck, parseExpectedUpdatedAt } from "../utils/optimisticConcurrency.js";
import { resolveOrAssertPointOfSaleId, assertPosAccess, hasPosAccess } from "../middleware/pos.permissions.js";
import { getCapabilities } from "../middleware/team.permissions.js";
import { normalizeProductImage } from "../utils/productImage.js";
import { attachImage, replacePrimaryImage } from "../services/productImage.service.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const TAX_TREATMENTS = ["taxed", "excluded", "exempt"];

const WEIGHT_UNITS = ["g", "kg"];
const DIMENSION_UNITS = ["cm", "m"];
const PACKAGING_TYPES = ["box", "envelope", "bag", "tube", "pallet"];
// Sanity ceilings, not real-world logistics limits - wide enough for
// anything a small/medium seller ships, tight enough to catch a stray
// extra zero (e.g. "50000" kg typed where "50" was meant).
const MAX_WEIGHT_GRAMS = 1_000_000; // 1000 kg
const MAX_DIMENSION_CM = 1000; // 10 m

const toGrams = (value, unit) => (unit === "kg" ? value * 1000 : value);
const toCm = (value, unit) => (unit === "m" ? value * 100 : value);
const gramsToUnit = (grams, unit) => (unit === "kg" ? grams / 1000 : grams);
const cmToUnit = (cm, unit) => (unit === "m" ? cm / 100 : cm);

// Standard Colombian-carrier divisor (Servientrega, Coordinadora,
// Interrápidísimo, TCC all use 5000 cm3/kg). A carrier that needs a
// different divisor applies it in its own future adapter against the raw
// dimensions - this stays the single, carrier-agnostic number stored on
// the product itself.
const computeVolumetricWeightGrams = (heightCm, widthCm, lengthCm) => {
    if (heightCm == null || widthCm == null || lengthCm == null) return null;
    return Number(((heightCm * widthCm * lengthCm) / 5).toFixed(2));
};

// Required-when-physical measurement: null/"" is an error (a physical
// product can't have half its measurements missing), undefined means "not
// being changed" and is left alone.
const parseRequiredMeasurement = (raw, unit, converter, max, label) => {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") {
        throw new ApiError(400, `${label} is required for a physical product`);
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new ApiError(400, `${label} must be a positive number`);
    }
    const canonical = converter(numeric, unit);
    if (canonical > max) {
        throw new ApiError(400, `${label} is above the allowed maximum`);
    }
    return canonical;
};

// Optional package-override measurement: null/"" explicitly clears the
// override (falls back to inheriting the unit's own weight/dimensions).
const parseOptionalMeasurement = (raw, unit, converter, max, label) => {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new ApiError(400, `${label} must be a positive number`);
    }
    const canonical = converter(numeric, unit);
    if (canonical > max) {
        throw new ApiError(400, `${label} is above the allowed maximum`);
    }
    return canonical;
};

// Resolves the physical-characteristics slice of a product create/update
// payload into Prisma-ready data, always normalized to grams/cm. Throws
// ApiError on anything invalid - callers must catch it themselves since it
// runs before the create/update's own try/catch (see createProduct/
// updateProduct). `existingProduct` is null on create.
const resolvePhysicalCharacteristics = (body, existingProduct) => {
    const isCreate = !existingProduct;
    const result = {};

    const isPhysicalProvided = body.is_physical !== undefined;
    const isPhysical = isPhysicalProvided
        ? body.is_physical === true || body.is_physical === "true"
        : existingProduct
        ? existingProduct.isPhysical
        : true;

    if (isPhysicalProvided) result.isPhysical = isPhysical;

    if (!isPhysical) {
        // Not a physical product (digital good/service) - clear whatever
        // physical data might already exist instead of leaving stale
        // numbers that would silently confuse a future shipping quote.
        if (isPhysicalProvided && existingProduct) {
            Object.assign(result, {
                weightValue: null,
                heightValue: null,
                widthValue: null,
                lengthValue: null,
                volumetricWeight: null,
                packageWeightValue: null,
                packageHeightValue: null,
                packageWidthValue: null,
                packageLengthValue: null,
            });
        }
        return result;
    }

    if (body.weight_unit !== undefined) {
        if (!WEIGHT_UNITS.includes(body.weight_unit)) {
            throw new ApiError(400, `weight_unit must be one of: ${WEIGHT_UNITS.join(", ")}`);
        }
        result.weightUnit = body.weight_unit;
    }
    if (body.dimension_unit !== undefined) {
        if (!DIMENSION_UNITS.includes(body.dimension_unit)) {
            throw new ApiError(400, `dimension_unit must be one of: ${DIMENSION_UNITS.join(", ")}`);
        }
        result.dimensionUnit = body.dimension_unit;
    }

    const weightUnit = result.weightUnit || existingProduct?.weightUnit || "g";
    const dimensionUnit = result.dimensionUnit || existingProduct?.dimensionUnit || "cm";

    const weightValue = parseRequiredMeasurement(body.weight_value, weightUnit, toGrams, MAX_WEIGHT_GRAMS, "weight_value");
    if (weightValue !== undefined) result.weightValue = weightValue;

    const heightValue = parseRequiredMeasurement(body.height_value, dimensionUnit, toCm, MAX_DIMENSION_CM, "height_value");
    if (heightValue !== undefined) result.heightValue = heightValue;

    const widthValue = parseRequiredMeasurement(body.width_value, dimensionUnit, toCm, MAX_DIMENSION_CM, "width_value");
    if (widthValue !== undefined) result.widthValue = widthValue;

    const lengthValue = parseRequiredMeasurement(body.length_value, dimensionUnit, toCm, MAX_DIMENSION_CM, "length_value");
    if (lengthValue !== undefined) result.lengthValue = lengthValue;

    // Creating a physical product (or flipping an existing non-physical one
    // back to physical) requires the full set up front - a half-filled
    // physical profile is exactly what makes a shipping quote silently
    // wrong later, so it's enforced now rather than left to whichever
    // carrier integration eventually reads it.
    const requiresFullSet = isCreate || (isPhysicalProvided && !existingProduct?.isPhysical);
    if (
        requiresFullSet &&
        (result.weightValue === undefined ||
            result.heightValue === undefined ||
            result.widthValue === undefined ||
            result.lengthValue === undefined)
    ) {
        throw new ApiError(
            400,
            "weight_value, height_value, width_value and length_value are required for a physical product"
        );
    }

    const effectiveHeight = result.heightValue ?? (existingProduct ? Number(existingProduct.heightValue) : undefined) ?? undefined;
    const effectiveWidth = result.widthValue ?? (existingProduct ? Number(existingProduct.widthValue) : undefined) ?? undefined;
    const effectiveLength = result.lengthValue ?? (existingProduct ? Number(existingProduct.lengthValue) : undefined) ?? undefined;
    if (effectiveHeight && effectiveWidth && effectiveLength) {
        result.volumetricWeight = computeVolumetricWeightGrams(effectiveHeight, effectiveWidth, effectiveLength);
    }

    if (body.units_per_package !== undefined) {
        const units = Number(body.units_per_package);
        if (!Number.isInteger(units) || units < 1) {
            throw new ApiError(400, "units_per_package must be a positive integer");
        }
        result.unitsPerPackage = units;
    }

    if (body.packaging_type !== undefined) {
        if (!PACKAGING_TYPES.includes(body.packaging_type)) {
            throw new ApiError(400, `packaging_type must be one of: ${PACKAGING_TYPES.join(", ")}`);
        }
        result.packagingType = body.packaging_type;
    }

    if (body.is_fragile !== undefined) {
        result.isFragile = body.is_fragile === true || body.is_fragile === "true";
    }

    if (body.package_weight_value !== undefined) {
        result.packageWeightValue = parseOptionalMeasurement(
            body.package_weight_value,
            weightUnit,
            toGrams,
            MAX_WEIGHT_GRAMS,
            "package_weight_value"
        );
    }
    if (body.package_height_value !== undefined) {
        result.packageHeightValue = parseOptionalMeasurement(
            body.package_height_value,
            dimensionUnit,
            toCm,
            MAX_DIMENSION_CM,
            "package_height_value"
        );
    }
    if (body.package_width_value !== undefined) {
        result.packageWidthValue = parseOptionalMeasurement(
            body.package_width_value,
            dimensionUnit,
            toCm,
            MAX_DIMENSION_CM,
            "package_width_value"
        );
    }
    if (body.package_length_value !== undefined) {
        result.packageLengthValue = parseOptionalMeasurement(
            body.package_length_value,
            dimensionUnit,
            toCm,
            MAX_DIMENSION_CM,
            "package_length_value"
        );
    }

    return result;
};

// Product.taxRate defaults to 0 at the schema level so it stays neutral for
// companies outside Colombia. When a CO company creates a product without an
// explicit tax rate, default it to the DIAN general VAT rate here instead -
// silently leaving it at 0 would understate IVA on every electronic invoice.
// The rate itself comes from SystemSetting (admin-editable), not a hardcoded
// constant, since it only ever changes by government decree (ET art. 468).
const resolveDefaultTaxRate = async (userId, explicitTaxRate) => {
    if (explicitTaxRate !== undefined) {
        return Number(explicitTaxRate);
    }

    const creator = await prisma.user.findUnique({
        where: { id: userId },
        select: { company: { select: { countryCode: true } } },
    });

    if (normalizeCountryCode(creator?.company?.countryCode) !== "CO") {
        return undefined;
    }

    const { vatRate } = await getColombiaTaxSettings();
    return vatRate;
};

// configurableAlerts is an Escala+ feature - silently drop the field for
// lower plans instead of hard-failing the whole product save, so a
// downgraded account doesn't suddenly get 400s on an otherwise valid form.
const resolveLowStockThreshold = async (userId, role, rawValue) => {
    if (rawValue === undefined) return undefined;
    if (role === "admin") {
        return rawValue === null || rawValue === "" ? null : Number(rawValue);
    }

    const subscription = await ensureUserSubscription(userId);
    const canConfigure = getPlanFeatures(getEffectivePlan(subscription)).configurableAlerts;
    if (!canConfigure) return undefined;

    return rawValue === null || rawValue === "" ? null : Number(rawValue);
};

// scopedStock overrides product.stock (the account-wide cache) with a
// restricted-scope viewer's own-location total - see
// productLocationStock.service.js#scopedStockForProducts. undefined means
// "no override" (full-scope actor, or a call site that doesn't apply
// scoping at all, e.g. right after creating a product whose stock is
// always 0 either way).
const mapProduct = (product, scopedStock) => ({
    _id: toExternalId(product),
    product_name: product.productName,
    product_code: product.productCode,
    category_id: product.category
        ? {
              _id: toExternalId(product.category),
              category_name: product.category.categoryName,
          }
        : null,
    unit_id: product.unit
        ? {
              _id: toExternalId(product.unit),
              unit_name: product.unit.unitName,
          }
        : null,
    purchase_unit_id: product.purchaseUnit
        ? {
              _id: toExternalId(product.purchaseUnit),
              unit_name: product.purchaseUnit.unitName,
          }
        : null,
    purchase_unit_conversion_factor: product.purchaseUnitConversionFactor === null || product.purchaseUnitConversionFactor === undefined ? null : Number(product.purchaseUnitConversionFactor),
    is_kit: product.isKit === true,
    tracks_batches: product.tracksBatches === true,
    components: (product.kitComponents || []).map((c) => ({
        product_id: toExternalId(c.componentProduct),
        product_name: c.componentProduct.productName,
        product_code: c.componentProduct.productCode,
        stock: c.componentProduct.stock,
        quantity: Number(c.quantity),
    })),
    is_manufactured: product.isManufactured === true,
    recipe_components: (product.recipeComponents || []).map((c) => ({
        product_id: toExternalId(c.componentProduct),
        product_name: c.componentProduct.productName,
        product_code: c.componentProduct.productCode,
        stock: c.componentProduct.stock,
        quantity: Number(c.quantity),
    })),
    buying_price: Number(product.buyingPrice),
    selling_price: Number(product.sellingPrice),
    stock: scopedStock !== undefined ? scopedStock : product.stock,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    status: product.status,
    product_image: normalizeProductImage(product.productImage),
    unit_measure_code: product.unitMeasureCode,
    standard_code: product.standardCode,
    tax_code: product.taxCode,
    tax_rate: product.taxRate === null ? null : Number(product.taxRate),
    tax_treatment: product.taxTreatment,
    low_stock_threshold: product.lowStockThreshold,
    is_physical: product.isPhysical,
    weight_value: product.weightValue === null ? null : Number(gramsToUnit(Number(product.weightValue), product.weightUnit)),
    weight_unit: product.weightUnit,
    height_value: product.heightValue === null ? null : Number(cmToUnit(Number(product.heightValue), product.dimensionUnit)),
    width_value: product.widthValue === null ? null : Number(cmToUnit(Number(product.widthValue), product.dimensionUnit)),
    length_value: product.lengthValue === null ? null : Number(cmToUnit(Number(product.lengthValue), product.dimensionUnit)),
    dimension_unit: product.dimensionUnit,
    volumetric_weight: product.volumetricWeight === null ? null : Number(gramsToUnit(Number(product.volumetricWeight), product.weightUnit)),
    units_per_package: product.unitsPerPackage,
    packaging_type: product.packagingType,
    is_fragile: product.isFragile,
    package_weight_value:
        product.packageWeightValue === null ? null : Number(gramsToUnit(Number(product.packageWeightValue), product.weightUnit)),
    package_height_value:
        product.packageHeightValue === null ? null : Number(cmToUnit(Number(product.packageHeightValue), product.dimensionUnit)),
    package_width_value:
        product.packageWidthValue === null ? null : Number(cmToUnit(Number(product.packageWidthValue), product.dimensionUnit)),
    package_length_value:
        product.packageLengthValue === null ? null : Number(cmToUnit(Number(product.packageLengthValue), product.dimensionUnit)),
    is_tutorial_data: product.isTutorialData,
    images: (product.images || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((img) => ({
            _id: toExternalId(img),
            url: img.url,
            position: img.position,
            is_primary: img.isPrimary,
            createdAt: img.createdAt,
            updatedAt: img.updatedAt,
        })),
    created_by: product.createdBy
        ? {
              _id: toExternalId(product.createdBy),
              username: product.createdBy.username,
          }
        : null,
    updated_by: product.updatedBy
        ? {
              _id: toExternalId(product.updatedBy),
              username: product.updatedBy.username,
          }
        : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
});

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            category: {
                select: { id: true, legacyMongoId: true, categoryName: true },
            },
            unit: {
                select: { id: true, legacyMongoId: true, unitName: true },
            },
            purchaseUnit: {
                select: { id: true, legacyMongoId: true, unitName: true },
            },
            kitComponents: {
                orderBy: { position: "asc" },
                include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
            },
            recipeComponents: {
                orderBy: { position: "asc" },
                include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
            },
            createdBy: {
                select: { id: true, legacyMongoId: true, username: true },
            },
            updatedBy: {
                select: { id: true, legacyMongoId: true, username: true },
            },
            images: { orderBy: { position: "asc" } },
        },
    });

const resolveCategoryForUser = async (categoryId, user) => {
    if (!categoryId) return null;

    const category = await prisma.category.findFirst({
        where: {
            OR: [{ id: categoryId }, { legacyMongoId: categoryId }],
        },
        include: {
            createdBy: {
                select: { id: true, role: true },
            },
        },
    });

    if (!category) return null;

    if (user.role === "admin" || category.createdById === user.prismaId) {
        return category;
    }

    return null;
};

const resolveUnitForUser = async (unitId, user) => {
    if (!unitId) return null;

    const unit = await prisma.unit.findFirst({
        where: {
            OR: [{ id: unitId }, { legacyMongoId: unitId }],
        },
        include: {
            createdBy: {
                select: { id: true, role: true },
            },
        },
    });

    if (!unit) return null;

    if (user.role === "admin" || unit.createdById === user.prismaId) {
        return unit;
    }

    return null;
};

// Both purchase_unit_id and purchase_unit_conversion_factor must be present
// together, or neither - a factor with no unit (or vice versa) means
// nothing, and purchase.service.js's conversion assumes both are set or
// both are null. `baseUnitId` guards against setting the purchase unit to
// the same unit the product is already stocked/sold in, which would make
// the "conversion" a no-op that just confuses the purchase form.
const resolvePurchaseUnit = async (purchaseUnitId, purchaseUnitConversionFactor, baseUnitId, user) => {
    const hasUnit = purchaseUnitId !== undefined && purchaseUnitId !== null && purchaseUnitId !== "";
    const hasFactor = purchaseUnitConversionFactor !== undefined && purchaseUnitConversionFactor !== null && purchaseUnitConversionFactor !== "";
    if (!hasUnit && !hasFactor) return { purchaseUnitId: null, purchaseUnitConversionFactor: null };
    if (hasUnit !== hasFactor) {
        throw new ApiError(400, "Provide both a purchase unit and a conversion factor, or neither.", [], "", "product_purchase_unit_incomplete");
    }

    const factor = Number(purchaseUnitConversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
        throw new ApiError(400, "The purchase unit conversion factor must be greater than 0.", [], "", "product_purchase_unit_factor_invalid");
    }

    const purchaseUnit = await resolveUnitForUser(purchaseUnitId, user);
    if (!purchaseUnit) {
        throw new ApiError(400, "Invalid purchase unit selected.", [], "", "product_purchase_unit_invalid");
    }
    if (baseUnitId && purchaseUnit.id === baseUnitId) {
        throw new ApiError(400, "The purchase unit must be different from the product's stock unit.", [], "", "product_purchase_unit_same_as_base");
    }

    return { purchaseUnitId: purchaseUnit.id, purchaseUnitConversionFactor: factor };
};

// Validates a kit's recipe before it's written - order.service.js#createOrder
// trusts this shape completely at sale time (no re-validation there), so
// every guarantee a kit sale needs (no nested kits, no duplicate/self
// components, positive quantities, components the caller actually owns)
// has to be enforced here, once, at save time.
const resolveKitComponents = async (components, ownProductId, user) => {
    if (!Array.isArray(components) || components.length === 0) {
        throw new ApiError(400, "A kit must have at least one component.", [], "", "product_kit_components_required");
    }
    if (components.length > 50) {
        throw new ApiError(400, "A kit can have at most 50 components.", [], "", "product_kit_too_many_components");
    }

    const normalized = components.map((c, index) => {
        const quantity = Number(c.quantity);
        if (!c.product_id || !Number.isFinite(quantity) || quantity <= 0) {
            throw new ApiError(400, `Kit component ${index + 1} is invalid.`, [], "", "product_kit_component_invalid");
        }
        return { productId: String(c.product_id), quantity };
    });

    const productIds = normalized.map((c) => c.productId);
    if (new Set(productIds).size !== productIds.length) {
        throw new ApiError(400, "A kit cannot list the same component twice.", [], "", "product_kit_duplicate_component");
    }
    if (ownProductId && productIds.includes(ownProductId)) {
        throw new ApiError(400, "A kit cannot contain itself as a component.", [], "", "product_kit_self_reference");
    }

    const components_ = await prisma.product.findMany({
        where: { OR: [{ id: { in: productIds } }, { legacyMongoId: { in: productIds } }] },
        select: { id: true, legacyMongoId: true, createdById: true, isKit: true },
    });
    const byAnyId = new Map(components_.flatMap((p) => [[p.id, p], ...(p.legacyMongoId ? [[p.legacyMongoId, p]] : [])]));

    return normalized.map((c, index) => {
        const product = byAnyId.get(c.productId);
        if (!product) throw new ApiError(400, `Kit component ${index + 1} was not found.`, [], "", "product_kit_component_not_found");
        if (user.role !== "admin" && product.createdById !== user.prismaId) {
            throw new ApiError(403, "You don't have permission to use one or more kit components");
        }
        if (product.isKit) {
            throw new ApiError(400, "A kit's components cannot themselves be kits.", [], "", "product_kit_nested_not_allowed");
        }
        return { componentProductId: product.id, quantity: c.quantity, position: index };
    });
};

// Same validation shape as resolveKitComponents, for a manufactured
// product's recipe - production.service.js#createProductionOrder trusts
// this completely (no re-validation there) the same way createOrder trusts
// a kit's resolved components. The one deliberate difference: no "nested
// not allowed" check - a recipe component IS allowed to itself be
// isManufactured (a multi-level BOM), since there's no recursive
// derivation here to protect against (see ProductionRecipeComponent's
// schema comment). Still blocks a kit as a component, same reasoning as
// isKit/isManufactured being mutually exclusive on the product itself - a
// kit has no real stock to consume.
const resolveRecipeComponents = async (components, ownProductId, user) => {
    if (!Array.isArray(components) || components.length === 0) {
        throw new ApiError(400, "A recipe must have at least one raw material.", [], "", "product_recipe_components_required");
    }
    if (components.length > 50) {
        throw new ApiError(400, "A recipe can have at most 50 raw materials.", [], "", "product_recipe_too_many_components");
    }

    const normalized = components.map((c, index) => {
        const quantity = Number(c.quantity);
        if (!c.product_id || !Number.isFinite(quantity) || quantity <= 0) {
            throw new ApiError(400, `Recipe material ${index + 1} is invalid.`, [], "", "product_recipe_component_invalid");
        }
        return { productId: String(c.product_id), quantity };
    });

    const productIds = normalized.map((c) => c.productId);
    if (new Set(productIds).size !== productIds.length) {
        throw new ApiError(400, "A recipe cannot list the same raw material twice.", [], "", "product_recipe_duplicate_component");
    }
    if (ownProductId && productIds.includes(ownProductId)) {
        throw new ApiError(400, "A recipe cannot contain itself as a raw material.", [], "", "product_recipe_self_reference");
    }

    const components_ = await prisma.product.findMany({
        where: { OR: [{ id: { in: productIds } }, { legacyMongoId: { in: productIds } }] },
        select: { id: true, legacyMongoId: true, createdById: true, isKit: true },
    });
    const byAnyId = new Map(components_.flatMap((p) => [[p.id, p], ...(p.legacyMongoId ? [[p.legacyMongoId, p]] : [])]));

    return normalized.map((c, index) => {
        const product = byAnyId.get(c.productId);
        if (!product) throw new ApiError(400, `Recipe material ${index + 1} was not found.`, [], "", "product_recipe_component_not_found");
        if (user.role !== "admin" && product.createdById !== user.prismaId) {
            throw new ApiError(403, "You don't have permission to use one or more raw materials");
        }
        if (product.isKit) {
            throw new ApiError(400, "A recipe's raw materials cannot be kits.", [], "", "product_recipe_kit_not_allowed");
        }
        return { componentProductId: product.id, quantity: c.quantity, position: index };
    });
};

const createProduct = asyncHandler(async (req, res, next) => {
    const {
        product_name,
        product_code,
        sku,
        barcode,
        brand,
        status,
        category_id,
        unit_id,
        purchase_unit_id,
        purchase_unit_conversion_factor,
        buying_price,
        selling_price,
        unit_measure_code,
        standard_code,
        tax_code,
        tax_rate,
        tax_treatment,
        low_stock_threshold,
        is_tutorial_data,
        is_kit,
        components,
        tracks_batches,
        is_manufactured,
        recipe_components,
    } = req.body;

    const PRODUCT_STATUSES = ["draft", "active", "archived"];
    if (status !== undefined && !PRODUCT_STATUSES.includes(status)) {
        return next(new ApiError(400, `status must be one of: ${PRODUCT_STATUSES.join(", ")}`));
    }

    if (tax_treatment !== undefined && !TAX_TREATMENTS.includes(tax_treatment)) {
        return next(new ApiError(400, `tax_treatment must be one of: ${TAX_TREATMENTS.join(", ")}`));
    }

    if (
        !product_name ||
        !product_code ||
        !category_id ||
        !unit_id ||
        buying_price === undefined ||
        selling_price === undefined
    ) {
        return next(new ApiError(400, "All product details are required"));
    }

    const buyingPrice = Number(buying_price);
    const sellingPrice = Number(selling_price);

    if (Number.isNaN(buyingPrice) || Number.isNaN(sellingPrice)) {
        return next(new ApiError(400, "Buying and selling prices must be valid numbers"));
    }

    if (buyingPrice <= 0 || sellingPrice <= 0) {
        return next(new ApiError(400, "Prices must be greater than 0"));
    }

    if (sellingPrice < buyingPrice) {
        return next(new ApiError(400, "Selling price must be >= buying price"));
    }

    if (String(product_code).trim().length > 40) {
        return next(new ApiError(400, "Product code must be 40 characters or less"));
    }

    if (String(product_name).trim().length > 50) {
        return next(new ApiError(400, "Product name must be 50 characters or less"));
    }

    let physicalData;
    try {
        physicalData = resolvePhysicalCharacteristics(req.body, null);
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        throw error;
    }

    try {
        const [category, unit] = await Promise.all([
            resolveCategoryForUser(category_id, req.user),
            resolveUnitForUser(unit_id, req.user),
        ]);

        if (!category) {
            return next(new ApiError(400, "Invalid category selected"));
        }

        if (!unit) {
            return next(new ApiError(400, "Invalid unit selected"));
        }

        const resolvedPurchaseUnit = await resolvePurchaseUnit(purchase_unit_id, purchase_unit_conversion_factor, unit.id, req.user);

        const isKit = is_kit === true || is_kit === "true";
        let resolvedComponents = [];
        if (isKit) {
            let parsedComponents;
            try {
                parsedComponents = typeof components === "string" ? JSON.parse(components) : components;
            } catch {
                return next(new ApiError(400, "Kit components must be a valid list.", [], "", "product_kit_component_invalid"));
            }
            resolvedComponents = await resolveKitComponents(parsedComponents, null, req.user);
        }

        const tracksBatches = tracks_batches === true || tracks_batches === "true";
        if (isKit && tracksBatches) {
            return next(new ApiError(400, "A kit's stock is virtual - it can't also track lots/expiration.", [], "", "product_kit_cannot_track_batches"));
        }

        const isManufactured = is_manufactured === true || is_manufactured === "true";
        if (isKit && isManufactured) {
            return next(new ApiError(400, "A kit's stock is virtual - it can't also be manufactured.", [], "", "product_kit_cannot_be_manufactured"));
        }
        let resolvedRecipeComponents = [];
        if (isManufactured) {
            let parsedRecipeComponents;
            try {
                parsedRecipeComponents = typeof recipe_components === "string" ? JSON.parse(recipe_components) : recipe_components;
            } catch {
                return next(new ApiError(400, "Recipe components must be a valid list.", [], "", "product_recipe_component_invalid"));
            }
            resolvedRecipeComponents = await resolveRecipeComponents(parsedRecipeComponents, null, req.user);
        }

        let productImageUrl = "default-product.png";
        if (req.file) {
            const image = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "products",
            });
            if (image) {
                productImageUrl = image.url;
            }
        }

        const resolvedTaxRate = await resolveDefaultTaxRate(req.user.prismaId, tax_rate !== undefined ? tax_rate : undefined);
        const resolvedLowStockThreshold = await resolveLowStockThreshold(req.user.prismaId, req.user.role, low_stock_threshold);

        const product = await prisma.product.create({
            data: {
                productName: String(product_name).trim(),
                productCode: String(product_code).trim().toUpperCase(),
                ...(sku !== undefined && { sku: String(sku).trim() || null }),
                ...(barcode !== undefined && { barcode: String(barcode).trim() || null }),
                ...(brand !== undefined && { brand: String(brand).trim() || null }),
                ...(status !== undefined && { status }),
                categoryId: category.id,
                unitId: unit.id,
                purchaseUnitId: resolvedPurchaseUnit.purchaseUnitId,
                purchaseUnitConversionFactor: resolvedPurchaseUnit.purchaseUnitConversionFactor,
                buyingPrice,
                sellingPrice,
                productImage: productImageUrl,
                stock: 0,
                isKit,
                ...(isKit && { kitComponents: { create: resolvedComponents } }),
                tracksBatches,
                isManufactured,
                ...(isManufactured && { recipeComponents: { create: resolvedRecipeComponents } }),
                isTutorialData: is_tutorial_data === true || is_tutorial_data === "true",
                createdById: req.user.prismaId,
                ...(unit_measure_code !== undefined && { unitMeasureCode: String(unit_measure_code).trim() }),
                ...(standard_code !== undefined && { standardCode: String(standard_code).trim() }),
                ...(tax_code !== undefined && { taxCode: String(tax_code).trim() || null }),
                ...(resolvedTaxRate !== undefined && { taxRate: resolvedTaxRate }),
                ...(tax_treatment !== undefined && { taxTreatment: tax_treatment }),
                ...(resolvedLowStockThreshold !== undefined && { lowStockThreshold: resolvedLowStockThreshold }),
                ...physicalData,
            },
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                purchaseUnit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                kitComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                recipeComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        // The scalar productImage column is already set above (create's own
        // data), so this only needs to create the matching gallery row -
        // attachImage's syncPrimaryScalar write is a harmless no-op repeat
        // of the same value.
        product.images = req.file ? [await attachImage(prisma, product.id, productImageUrl)] : [];

        emitAccountEvent(req.user.prismaId, "product", "created");
        enqueueWebhookEvent(req.user.prismaId, "product.created", { product_id: toExternalId(product) }).catch(() => {});
        return res
            .status(201)
            .json(new ApiResponse(201, mapProduct(product), "Product created successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        if (error.code === "P2002") {
            const target = error.meta?.target?.join?.(",") || "";
            return next(
                new ApiError(409, target.includes("sku") ? "Product with this SKU already exists" : "Product with this code already exists")
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getAllProducts = asyncHandler(async (req, res, next) => {
    const { search, category, min_stock, max_stock, sort_by, sort_order } = req.query;

    const where = {};

    // scope=own: only this company's catalog even for a platform admin (who
    // otherwise sees every account's products here). The Caja and the
    // offline mirror use it - selling or queuing another company's product
    // is never valid, and the server rejects it anyway.
    if (req.user.role !== "admin" || req.query.scope === "own") {
        where.createdById = req.user.prismaId;
    }

    if (search) {
        where.OR = [
            { productName: { contains: search, mode: "insensitive" } },
            { productCode: { contains: search, mode: "insensitive" } },
        ];
    }

    if (category) {
        where.category = {
            OR: [{ id: category }, { legacyMongoId: category }],
        };
    }

    const minStock = min_stock !== undefined ? Number(min_stock) : undefined;
    const maxStock = max_stock !== undefined ? Number(max_stock) : undefined;

    if (!Number.isNaN(minStock) || !Number.isNaN(maxStock)) {
        where.stock = {};
        if (!Number.isNaN(minStock)) where.stock.gte = minStock;
        if (!Number.isNaN(maxStock)) where.stock.lte = maxStock;
    }

    const sortFieldMap = {
        product_name: "productName",
        product_code: "productCode",
        buying_price: "buyingPrice",
        selling_price: "sellingPrice",
        stock: "stock",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
    };

    const mappedSortField = sortFieldMap[sort_by] || "createdAt";
    const sortDirection = sort_order === "desc" ? "desc" : "asc";
    const orderBy = sort_by
        ? { [mappedSortField]: sortDirection }
        : { createdAt: "desc" };

    try {
        const products = await prisma.product.findMany({
            where,
            orderBy,
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                purchaseUnit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                kitComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                recipeComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                images: { orderBy: { position: "asc" } },
            },
        });

        // The catalog itself (this query) stays account-wide on purpose -
        // see mapProduct's comment - only the displayed quantity narrows to
        // the viewer's own location(s).
        // point_of_sale_id: "what can I sell HERE" (the Caja) - stock becomes
        // that one location's sellable quantity instead of an account total
        // that a checkout at this location could never actually claim.
        const requestedPos = req.query.point_of_sale_id ? String(req.query.point_of_sale_id) : null;
        let scopedStock;
        if (requestedPos) {
            const pos = await prisma.pointOfSale.findFirst({ where: { id: requestedPos, accountId: req.user.prismaId }, select: { id: true } });
            if (!pos) return next(new ApiError(404, "Punto de venta no encontrado."));
            if (req.user.role !== "admin" && !hasPosAccess(req.user, pos.id)) {
                return next(new ApiError(403, "No tienes acceso a este punto de venta."));
            }
            scopedStock = await sellableStockAtLocation(products, pos.id);
        } else {
            scopedStock = await scopedStockForProducts(
                req.user,
                products.map((p) => p.id)
            );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    products.map((p) => mapProduct(p, scopedStock?.get(p.id))),
                    "Products fetched successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updateProduct = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updateData = req.body;

    // A member who can't see costs (catalogViewCosts) can't change them
    // either - their form never had the real value, so whatever arrives
    // (blank, stale) must not overwrite it.
    if (!(await getCapabilities(req.user)).catalogViewCosts) {
        delete updateData.buying_price;
    }

    if (
        updateData.tax_treatment !== undefined &&
        !TAX_TREATMENTS.includes(updateData.tax_treatment)
    ) {
        return next(new ApiError(400, `tax_treatment must be one of: ${TAX_TREATMENTS.join(", ")}`));
    }

    if (updateData.status !== undefined && !["draft", "active", "archived"].includes(updateData.status)) {
        return next(new ApiError(400, "status must be one of: draft, active, archived"));
    }

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to update this product")
            );
        }

        let physicalData;
        try {
            physicalData = resolvePhysicalCharacteristics(updateData, existingProduct);
        } catch (error) {
            if (error instanceof ApiError) return next(error);
            throw error;
        }

        let resolvedCategoryId;
        if (updateData.category_id !== undefined) {
            const category = await resolveCategoryForUser(updateData.category_id, req.user);
            if (!category) {
                return next(new ApiError(400, "Invalid category selected"));
            }
            resolvedCategoryId = category.id;
        }

        let resolvedUnitId;
        if (updateData.unit_id !== undefined) {
            const unit = await resolveUnitForUser(updateData.unit_id, req.user);
            if (!unit) {
                return next(new ApiError(400, "Invalid unit selected"));
            }
            resolvedUnitId = unit.id;
        }

        // Only touched when the request actually sent one of these two keys
        // - same "undefined means leave it alone" convention as every other
        // optional field on this endpoint (e.g. resolvedUnitId above).
        // Passing both as null/"" clears the purchase unit; passing neither
        // key at all leaves whatever was already configured untouched.
        let resolvedPurchaseUnit;
        if (updateData.purchase_unit_id !== undefined || updateData.purchase_unit_conversion_factor !== undefined) {
            resolvedPurchaseUnit = await resolvePurchaseUnit(
                updateData.purchase_unit_id,
                updateData.purchase_unit_conversion_factor,
                resolvedUnitId || existingProduct.unitId,
                req.user
            );
        }

        // Only touched when the request sent `is_kit` - same "undefined
        // leaves it alone" convention as above. Turning a stocked physical
        // product into a kit would leave its existing stock/location rows
        // meaningless (a kit's stock always comes from its components going
        // forward, see Product.isKit's schema comment), so that direction is
        // blocked outright rather than silently orphaning real inventory;
        // the merchant creates a new kit product instead. Turning a kit
        // back into a plain product is always safe (it just starts a normal
        // product with 0 stock) and clears its recipe.
        let nextIsKit;
        let resolvedComponents;
        if (updateData.is_kit !== undefined) {
            nextIsKit = updateData.is_kit === true || updateData.is_kit === "true";
            if (nextIsKit && !existingProduct.isKit && existingProduct.stock !== 0) {
                return next(new ApiError(409, "This product already has stock recorded and cannot be converted into a kit.", [], "", "product_kit_conversion_has_stock"));
            }
            if (nextIsKit) {
                let parsedComponents;
                try {
                    parsedComponents = typeof updateData.components === "string" ? JSON.parse(updateData.components) : updateData.components;
                } catch {
                    return next(new ApiError(400, "Kit components must be a valid list.", [], "", "product_kit_component_invalid"));
                }
                resolvedComponents = await resolveKitComponents(parsedComponents, existingProduct.id, req.user);
            } else {
                resolvedComponents = [];
            }
        }

        // Same "undefined leaves it alone" convention, same stock-guard
        // rationale as is_kit above (a lot can't be retroactively assigned
        // to stock that arrived before tracking was turned on) - see
        // Product.tracksBatches's schema comment. Turning it off is always
        // safe; any lots already recorded simply stop being touched by
        // future sales/purchases (they're never deleted, just orphaned from
        // new activity, same as a kit's cleared recipe above).
        let nextTracksBatches;
        if (updateData.tracks_batches !== undefined) {
            nextTracksBatches = updateData.tracks_batches === true || updateData.tracks_batches === "true";
            if (nextTracksBatches && !existingProduct.tracksBatches && existingProduct.stock !== 0) {
                return next(new ApiError(409, "This product already has stock recorded and cannot start tracking lots/expiration.", [], "", "product_batch_conversion_has_stock"));
            }
        }
        // Same "undefined leaves it alone" convention and stock-guard as
        // is_kit above - see Product.isManufactured's schema comment.
        // Turning it off is always safe; the recipe is simply cleared, same
        // as a kit's own.
        let nextIsManufactured;
        let resolvedRecipeComponents;
        if (updateData.is_manufactured !== undefined) {
            nextIsManufactured = updateData.is_manufactured === true || updateData.is_manufactured === "true";
            if (nextIsManufactured && !existingProduct.isManufactured && existingProduct.stock !== 0) {
                return next(new ApiError(409, "This product already has stock recorded and cannot be converted into a manufactured product.", [], "", "product_manufactured_conversion_has_stock"));
            }
            if (nextIsManufactured) {
                let parsedRecipeComponents;
                try {
                    parsedRecipeComponents = typeof updateData.recipe_components === "string" ? JSON.parse(updateData.recipe_components) : updateData.recipe_components;
                } catch {
                    return next(new ApiError(400, "Recipe components must be a valid list.", [], "", "product_recipe_component_invalid"));
                }
                resolvedRecipeComponents = await resolveRecipeComponents(parsedRecipeComponents, existingProduct.id, req.user);
            } else {
                resolvedRecipeComponents = [];
            }
        }

        const effectiveIsKit = nextIsKit !== undefined ? nextIsKit : existingProduct.isKit;
        const effectiveTracksBatches = nextTracksBatches !== undefined ? nextTracksBatches : existingProduct.tracksBatches;
        const effectiveIsManufactured = nextIsManufactured !== undefined ? nextIsManufactured : existingProduct.isManufactured;
        if (effectiveIsKit && effectiveTracksBatches) {
            return next(new ApiError(400, "A kit's stock is virtual - it can't also track lots/expiration.", [], "", "product_kit_cannot_track_batches"));
        }
        if (effectiveIsKit && effectiveIsManufactured) {
            return next(new ApiError(400, "A kit's stock is virtual - it can't also be manufactured.", [], "", "product_kit_cannot_be_manufactured"));
        }

        // Handled after the product row itself is updated below (see
        // replacePrimaryImage) rather than as a plain field on `payload`, so
        // the ProductImage gallery row and the productImage scalar can't
        // drift apart - see services/productImage.service.js.
        let uploadedImageUrl = null;
        if (req.file) {
            const image = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "products",
            });
            if (image) {
                uploadedImageUrl = image.url;
            }
        }

        const resolvedLowStockThreshold = await resolveLowStockThreshold(
            req.user.prismaId,
            req.user.role,
            updateData.low_stock_threshold
        );

        const payload = {
            ...(updateData.product_name !== undefined && {
                productName: String(updateData.product_name).trim(),
            }),
            ...(updateData.product_code !== undefined && {
                productCode: String(updateData.product_code).trim().toUpperCase(),
            }),
            ...(updateData.sku !== undefined && { sku: updateData.sku ? String(updateData.sku).trim() : null }),
            ...(updateData.barcode !== undefined && { barcode: updateData.barcode ? String(updateData.barcode).trim() : null }),
            ...(updateData.brand !== undefined && { brand: updateData.brand ? String(updateData.brand).trim() : null }),
            ...(updateData.status !== undefined && { status: updateData.status }),
            ...(resolvedCategoryId && { categoryId: resolvedCategoryId }),
            ...(resolvedUnitId && { unitId: resolvedUnitId }),
            ...(resolvedPurchaseUnit !== undefined && {
                purchaseUnitId: resolvedPurchaseUnit.purchaseUnitId,
                purchaseUnitConversionFactor: resolvedPurchaseUnit.purchaseUnitConversionFactor,
            }),
            ...(nextIsKit !== undefined && { isKit: nextIsKit }),
            ...(nextTracksBatches !== undefined && { tracksBatches: nextTracksBatches }),
            ...(nextIsManufactured !== undefined && { isManufactured: nextIsManufactured }),
            ...(updateData.buying_price !== undefined && {
                buyingPrice: Number(updateData.buying_price),
            }),
            ...(updateData.selling_price !== undefined && {
                sellingPrice: Number(updateData.selling_price),
            }),
            // stock is intentionally NOT accepted here - it used to be a free
            // field on this same general-purpose edit endpoint, which let it
            // be overwritten with no reason, no audit trail, and no
            // stock_movements row. Use POST /products/:id/adjust-stock
            // instead, which requires a reason and records the movement.
            ...(updateData.unit_measure_code !== undefined && {
                unitMeasureCode: String(updateData.unit_measure_code).trim(),
            }),
            ...(updateData.standard_code !== undefined && {
                standardCode: String(updateData.standard_code).trim(),
            }),
            ...(updateData.tax_code !== undefined && {
                taxCode: String(updateData.tax_code).trim() || null,
            }),
            ...(updateData.tax_rate !== undefined && { taxRate: Number(updateData.tax_rate) }),
            ...(updateData.tax_treatment !== undefined && { taxTreatment: updateData.tax_treatment }),
            ...(resolvedLowStockThreshold !== undefined && { lowStockThreshold: resolvedLowStockThreshold }),
            ...physicalData,
            updatedById: req.user.prismaId,
        };

        if (payload.productCode && payload.productCode.length > 40) {
            return next(new ApiError(400, "Product code must be 40 characters or less"));
        }

        if (payload.productName && payload.productName.length > 50) {
            return next(new ApiError(400, "Product name must be 50 characters or less"));
        }

        if (
            payload.buyingPrice !== undefined &&
            (Number.isNaN(payload.buyingPrice) || payload.buyingPrice <= 0)
        ) {
            return next(new ApiError(400, "Buying price must be greater than 0"));
        }

        if (
            payload.sellingPrice !== undefined &&
            (Number.isNaN(payload.sellingPrice) || payload.sellingPrice <= 0)
        ) {
            return next(new ApiError(400, "Selling price must be greater than 0"));
        }

        if (payload.taxRate !== undefined && (Number.isNaN(payload.taxRate) || payload.taxRate < 0)) {
            return next(new ApiError(400, "Tax rate must be a non-negative number"));
        }

        const buyingPriceForValidation =
            payload.buyingPrice !== undefined
                ? payload.buyingPrice
                : Number(existingProduct.buyingPrice);
        const sellingPriceForValidation =
            payload.sellingPrice !== undefined
                ? payload.sellingPrice
                : Number(existingProduct.sellingPrice);

        if (sellingPriceForValidation < buyingPriceForValidation) {
            return next(new ApiError(400, "Selling price must be >= buying price"));
        }

        let product = await updateWithConflictCheck({
            model: prisma.product,
            id: existingProduct.id,
            expectedUpdatedAt: parseExpectedUpdatedAt(updateData.expected_updated_at),
            data: payload,
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                purchaseUnit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                kitComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                recipeComponents: {
                    orderBy: { position: "asc" },
                    include: { componentProduct: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, stock: true } } },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                images: { orderBy: { position: "asc" } },
            },
            conflictMessage: "This product was changed by someone else. Reload to see the latest version.",
        });

        // updateWithConflictCheck's `data` can't carry a nested relation
        // write (its expectedUpdatedAt branch goes through updateMany,
        // which Prisma doesn't allow relation writes on at all) - so the
        // kit recipe is replaced as its own step once the scalar update
        // above has already succeeded, same "separate step after the main
        // update" idiom the image handling right below already uses.
        if (resolvedComponents !== undefined) {
            await prisma.productKitComponent.deleteMany({ where: { kitProductId: existingProduct.id } });
            if (resolvedComponents.length > 0) {
                await prisma.productKitComponent.createMany({
                    data: resolvedComponents.map((c) => ({ ...c, kitProductId: existingProduct.id })),
                });
            }
            product = await findProductByAnyId(existingProduct.id);
        }

        // Same "separate step after the conflict-checked update" workaround
        // as resolvedComponents above - updateWithConflictCheck's
        // expectedUpdatedAt branch goes through updateMany, which can't
        // carry a nested relation write.
        if (resolvedRecipeComponents !== undefined) {
            await prisma.productionRecipeComponent.deleteMany({ where: { productId: existingProduct.id } });
            if (resolvedRecipeComponents.length > 0) {
                await prisma.productionRecipeComponent.createMany({
                    data: resolvedRecipeComponents.map((c) => ({ ...c, productId: existingProduct.id })),
                });
            }
            product = await findProductByAnyId(existingProduct.id);
        }

        // The DB row is only safely pointed at the new image once this
        // succeeds - replacePrimaryImage deletes the old primary's file
        // itself (mirrors the old fire-and-forget deleteFile behavior here)
        // and keeps productImage/ProductImage in sync either way.
        if (uploadedImageUrl) {
            await replacePrimaryImage(prisma, existingProduct.id, uploadedImageUrl);
            product = await findProductByAnyId(existingProduct.id);
        }

        emitAccountEvent(existingProduct.createdById, "product", "updated");
        enqueueWebhookEvent(existingProduct.createdById, "product.updated", { product_id: toExternalId(product) }).catch(() => {});
        const scopedStock = await scopedStockForProducts(req.user, [product.id]);
        return res
            .status(200)
            .json(new ApiResponse(200, mapProduct(product, scopedStock?.get(product.id)), "Product updated successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        if (error.code === "P2002") {
            const target = error.meta?.target?.join?.(",") || "";
            return next(
                new ApiError(409, target.includes("sku") ? "Product with this SKU already exists" : "Product with this code already exists")
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const deleteProduct = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to delete this product")
            );
        }

        await prisma.product.delete({ where: { id: existingProduct.id } });
        // The DB rows are already gone via the ProductImage relation's
        // onDelete: Cascade - this only cleans up their R2 objects, which
        // cascade doesn't touch. Covers every gallery image, not just the
        // primary (existingProduct.productImage is always one of these
        // urls once a product has real images - see
        // productImage.service.js#syncPrimaryScalar).
        existingProduct.images.forEach((img) => deleteFile(img.url));

        emitAccountEvent(existingProduct.createdById, "product", "deleted");
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Product deleted successfully"));
    } catch (error) {
        if (isForeignKeyRestrictError(error)) {
            // Warranty.productId is also RESTRICT (see schema.prisma) - call
            // that out specifically rather than folding it into the vaguer
            // "purchases, sales, or stock movements" message below.
            if (typeof error?.message === "string" && error.message.includes("warrant")) {
                return next(
                    new ApiError(
                        409,
                        "This product can't be deleted because it has warranty claims on record. Resolve or delete those first.",
                        [],
                        "",
                        "product_has_warranties"
                    )
                );
            }
            return next(
                new ApiError(
                    409,
                    "This product can't be deleted because it has purchases, sales, or stock movements on record. Remove or reassign that history first.",
                    [],
                    "",
                    "product_has_history"
                )
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Sets the same low-stock threshold on many products in one request - the
// per-product field (Escala+, see resolveLowStockThreshold above) used to
// only be reachable one product at a time through ProductModal, which made
// re-tuning thresholds across a whole category a real chore. Unlike that
// helper, this endpoint's whole purpose IS setting the threshold, so an
// account without the feature gets an explicit 403 instead of resolveLowStockThreshold's
// silent no-op (which exists for the general product save, where the field
// is just one of many that may or may not be present).
const bulkUpdateLowStockThreshold = asyncHandler(async (req, res, next) => {
    const { productIds, threshold } = req.body || {};

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return next(new ApiError(400, "productIds must be a non-empty array"));
    }
    if (productIds.length > 500) {
        return next(new ApiError(400, "You can update at most 500 products at once"));
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const canConfigure =
        req.user.role === "admin" || getPlanFeatures(getEffectivePlan(subscription)).configurableAlerts;
    if (!canConfigure) {
        return next(
            new ApiError(403, "Los umbrales personalizados por producto están disponibles desde el plan Escala.")
        );
    }

    const value = threshold === null || threshold === "" ? null : Number(threshold);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return next(new ApiError(400, "threshold must be a non-negative number, or null to clear it"));
    }

    // Same dual id lookup as findProductByAnyId (ids may be Prisma cuids or
    // legacy Mongo ids), scoped to this account's own catalog unless admin -
    // matches updateProduct/deleteProduct's ownership rule above.
    const result = await prisma.product.updateMany({
        where: {
            AND: [
                { OR: [{ id: { in: productIds } }, { legacyMongoId: { in: productIds } }] },
                ...(req.user.role === "admin" ? [] : [{ createdById: req.user.prismaId }]),
            ],
        },
        data: { lowStockThreshold: value, updatedById: req.user.prismaId },
    });

    if (result.count > 0) emitAccountEvent(req.user.prismaId, "product", "updated");
    return res
        .status(200)
        .json(new ApiResponse(200, { updatedCount: result.count }, "Umbrales actualizados correctamente"));
});

// Explicit, audited stock correction - the only way to change Product.stock
// outside of a purchase/sale/return, requiring a reason and always writing a
// stock_movements row (sourceType: "adjustment"). Replaces the old free
// `stock` field on the general product edit endpoint above.
const adjustProductStock = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { delta, reason, batch_number, batch_expiration_date } = req.body;

    const parsedDelta = Number(delta);

    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
        return next(new ApiError(400, "Delta must be a non-zero integer"));
    }

    if (!reason || !String(reason).trim()) {
        return next(new ApiError(400, "A reason is required to adjust stock"));
    }

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        // A positive adjustment on a tracksBatches product restocks a named
        // lot (same information a purchase receipt would ask for); a
        // negative one draws down whichever lot(s) FEFO order picks, same
        // as a sale - see productBatch.service.js.
        if (existingProduct.tracksBatches && parsedDelta > 0 && !String(batch_number || "").trim()) {
            return next(new ApiError(400, "A lot/batch number is required to add stock for this product.", [], "", "product_batch_number_required"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to adjust this product's stock")
            );
        }

        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);

        const result = await prisma.$transaction(async (tx) => {
            // An adjustment can go either way - claim (guarded, can fail) for
            // a decrease, credit (unconditional) for an increase - both
            // against this location's stock, not the product's account-wide
            // total.
            const costing =
                parsedDelta < 0
                    ? await claimLocationStockWithCost(tx, {
                          productId: existingProduct.id,
                          pointOfSaleId,
                          quantity: -parsedDelta,
                      })
                    : await creditLocationStockWithCost(tx, {
                          productId: existingProduct.id,
                          pointOfSaleId,
                          quantity: parsedDelta,
                          incomingUnitCost: existingProduct.buyingPrice,
                      });

            if (costing === null) {
                throw new ApiError(
                    409,
                    "Not enough stock to apply this adjustment"
                );
            }

            if (existingProduct.tracksBatches) {
                if (parsedDelta > 0) {
                    await creditBatch(tx, {
                        productId: existingProduct.id,
                        pointOfSaleId,
                        batchNumber: batch_number,
                        expirationDate: batch_expiration_date || null,
                        quantity: parsedDelta,
                        createdById: req.user.prismaId,
                    });
                } else {
                    const batchClaim = await claimBatchesFEFO(tx, {
                        productId: existingProduct.id,
                        pointOfSaleId,
                        quantity: -parsedDelta,
                    });
                    if (batchClaim === null) {
                        throw new ApiError(409, "Not enough lot/batch stock to apply this adjustment", [], "", "product_batch_stock_mismatch");
                    }
                }
            }

            await tx.product.update({
                where: { id: existingProduct.id },
                data: { updatedById: req.user.prismaId },
            });

            const updated = await tx.product.findUniqueOrThrow({
                where: { id: existingProduct.id },
                include: {
                    category: { select: { id: true, legacyMongoId: true, categoryName: true } },
                    unit: { select: { id: true, legacyMongoId: true, unitName: true } },
                    createdBy: { select: { id: true, legacyMongoId: true, username: true } },
                    updatedBy: { select: { id: true, legacyMongoId: true, username: true } },
                    images: { orderBy: { position: "asc" } },
                },
            });

            const movement = await recordStockMovement(tx, {
                productId: existingProduct.id,
                accountId: existingProduct.createdById,
                pointOfSaleId,
                delta: parsedDelta,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "adjustment",
                sourceId: null,
                reason: String(reason).trim(),
                createdById: req.user.prismaId,
            });

            await postInventoryAdjustmentJournalEntry(tx, {
                accountId: existingProduct.createdById,
                createdById: req.user.prismaId,
                movementId: movement.id,
                valueDelta: costing.valueDelta,
                reason: String(reason).trim(),
                entryDate: movement.createdAt,
            });

            return updated;
        });

        emitPosEvent(existingProduct.createdById, pointOfSaleId, "product", "stock-changed");
        enqueueWebhookEvent(existingProduct.createdById, "inventory.updated", { product_id: toExternalId(result) }).catch(() => {});
        const scopedStock = await scopedStockForProducts(req.user, [result.id]);
        return res
            .status(200)
            .json(new ApiResponse(200, mapProduct(result, scopedStock?.get(result.id)), "Stock adjusted successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Read-only ledger for a single product - the movement history the audit
// found nowhere for the user to actually see (StockMovement is the only
// table that records it). Tenant-scoped the same way every other product
// read is: non-admins only ever see their own account's product.
const getProductStockMovements = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to view this product's history")
            );
        }

        const movements = await prisma.stockMovement.findMany({
            where: {
                productId: existingProduct.id,
                // Product is global (shared across every Point of Sale on
                // the account), but each individual movement isn't - a
                // restricted-scope actor sees only the history for
                // locations they're allowed to see, not the product's full
                // cross-location ledger.
                ...(req.user.role !== "admin" && !req.user.posScopeAll
                    ? { pointOfSaleId: { in: req.user.posScopeIds || [] } }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                createdBy: { select: { id: true, legacyMongoId: true, username: true } },
            },
        });

        const mapped = movements.map((m) => ({
            _id: m.id,
            delta: m.delta,
            balance_after: m.balanceAfter,
            source_type: m.sourceType,
            source_id: m.sourceId,
            reason: m.reason,
            created_by: m.createdBy
                ? { _id: m.createdBy.legacyMongoId || m.createdBy.id, username: m.createdBy.username }
                : null,
            createdAt: m.createdAt,
        }));

        return res
            .status(200)
            .json(new ApiResponse(200, mapped, "Stock movements fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Per-location breakdown for a single product - "10 in Pereira, 25 in
// Bogotá". Restricted-scope actors only see the locations they're allowed
// to see, same rule as everywhere else (see pos.permissions.js).
const getProductLocationStock = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to view this product's stock")
            );
        }

        const visibleLocationIds =
            req.user.role === "admin" || req.user.posScopeAll ? null : req.user.posScopeIds || [];
        const summary = await getLocationStockSummary(existingProduct.id, existingProduct.createdById, visibleLocationIds);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    locations: summary.locations.map((row) => ({
                        point_of_sale_id: row.pointOfSaleId,
                        point_of_sale_name: row.name,
                        location_type: row.locationType,
                        is_default: row.isDefault,
                        is_active: row.isActive,
                        available: row.available,
                        in_transit: row.inTransit,
                        total: row.total,
                    })),
                    totals: summary.totals,
                },
                "Location stock fetched successfully"
            )
        );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Every open lot for one tracksBatches product, soonest-expiring first -
// powers the "Lotes" drawer on the product detail view.
const getProductBatchesList = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingProduct = await findProductByAnyId(id);
        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }
        if (req.user.role !== "admin" && existingProduct.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to view this product's lots"));
        }

        const batches = await listBatches({ accountId: existingProduct.createdById, productId: existingProduct.id });
        return res.status(200).json(
            new ApiResponse(
                200,
                batches.map((b) => ({
                    _id: b.id,
                    batch_number: b.batchNumber,
                    expiration_date: b.expirationDate,
                    quantity: b.quantity,
                    point_of_sale_id: b.pointOfSale.id,
                    point_of_sale_name: b.pointOfSale.name,
                })),
                "Batches fetched successfully"
            )
        );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Account-wide "vencimientos próximos" alert - every open lot across every
// tracksBatches product expiring within `days` (default 30), soonest first.
// Feeds a dashboard/report widget rather than any one product's page.
const getExpiringProductBatches = asyncHandler(async (req, res, next) => {
    try {
        const days = Number(req.query.days);
        const accountId = req.user.role === "admin" && req.query.account_id ? req.query.account_id : req.user.prismaId;
        const batches = await listBatches({
            accountId,
            expiresWithinDays: Number.isFinite(days) && days > 0 ? days : 30,
        });

        return res.status(200).json(
            new ApiResponse(
                200,
                batches.map((b) => ({
                    _id: b.id,
                    batch_number: b.batchNumber,
                    expiration_date: b.expirationDate,
                    quantity: b.quantity,
                    product_id: toExternalId(b.product),
                    product_name: b.product.productName,
                    product_code: b.product.productCode,
                    point_of_sale_id: b.pointOfSale.id,
                    point_of_sale_name: b.pointOfSale.name,
                })),
                "Expiring batches fetched successfully"
            )
        );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// "Traslado rápido" - a move that already happened physically, executed
// and fully received in one step. See stockTransfer.service.js#quickTransfer
// for why this still produces a full, traceable StockTransfer row instead
// of a shortcut that skips the ledger. The multi-step request/approve/
// ship/receive/cancel workflow lives under /stock-transfers (see
// stockTransfer.routes.js) - this endpoint only ever does the quick path.
const transferProductStock = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { from_point_of_sale_id, to_point_of_sale_id, quantity, reason } = req.body || {};

    try {
        const existingProduct = await findProductByAnyId(id);

        if (!existingProduct) {
            return next(new ApiError(404, "Product not found"));
        }
        if (
            req.user.role !== "admin" &&
            existingProduct.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to transfer this product's stock")
            );
        }
        if (req.user.role !== "admin") {
            assertPosAccess(req.user, from_point_of_sale_id);
            assertPosAccess(req.user, to_point_of_sale_id);
        }

        const transfer = await quickTransfer({
            accountId: existingProduct.createdById,
            actorId: req.user.actorId,
            productId: existingProduct.id,
            fromPointOfSaleId: from_point_of_sale_id,
            toPointOfSaleId: to_point_of_sale_id,
            quantity: Number(quantity),
            notes: reason ? String(reason).trim() : null,
        });

        return res.status(200).json(
            new ApiResponse(200, mapStockTransfer(transfer), "Stock transferred successfully")
        );
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getAllProductsAdmin = asyncHandler(async (_req, res, next) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                category: {
                    select: { id: true, legacyMongoId: true, categoryName: true },
                },
                unit: {
                    select: { id: true, legacyMongoId: true, unitName: true },
                },
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                updatedBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                images: { orderBy: { position: "asc" } },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, products.map(mapProduct), "All products fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    createProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    bulkUpdateLowStockThreshold,
    getAllProductsAdmin,
    adjustProductStock,
    getProductStockMovements,
    getProductLocationStock,
    getProductBatchesList,
    getExpiringProductBatches,
    transferProductStock,
    mapProduct,
    findProductByAnyId,
};
