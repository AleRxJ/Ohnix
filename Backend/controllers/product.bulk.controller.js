import AdmZip from "adm-zip";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile } from "../utils/storage.js";
import { attachImage } from "../services/productImage.service.js";
import { prisma } from "../db/prisma.js";
import fs from "fs";
import {
    ensureUserSubscription,
    ensureActiveSubscription,
    getEffectivePlan,
    getPlanLimits,
} from "../middleware/pricing.middleware.js";
import { emitAccountEvent } from "../live/dataEvents.js";

const parseCSV = (csvText) => {
    const normalized =
        csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
    const lines = normalized
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((line) => line.trim().length > 0);

    if (lines.length < 2) return { headers: [], rows: [] };

    const parseRow = (line) => {
        const result = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === "," && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = parseRow(lines[0]).map((h) =>
        h.toLowerCase().replace(/\s+/g, "_")
    );
    const rows = lines.slice(1).map((line) => {
        const values = parseRow(line);
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] !== undefined ? values[i] : "";
        });
        return obj;
    });

    return { headers, rows };
};

const REQUIRED_COLUMNS = [
    "product_name",
    "product_code",
    "category_name",
    "unit_name",
    "buying_price",
    "selling_price",
];

const PRODUCT_STATUSES = ["draft", "active", "archived"];
const TAX_TREATMENTS = ["taxed", "excluded", "exempt"];
const WEIGHT_UNITS = ["g", "kg"];
const DIMENSION_UNITS = ["cm", "m"];
const PACKAGING_TYPES = ["box", "envelope", "bag", "tube", "pallet"];

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MIME_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

const basenameNoExt = (fileName) => {
    const clean = fileName.split("/").pop() || fileName;
    return clean.replace(/\.[^.]+$/, "").toLowerCase().trim();
};

// A .zip upload bundles the CSV together with the product photos it
// references - extractZipContents pulls both out in one pass so the rest of
// the controller can treat a ZIP and a bare CSV the same way from here on.
const extractZipContents = (buffer) => {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.startsWith("__MACOSX/"));

    const csvEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".csv"));
    if (!csvEntry) {
        throw new ApiError(400, "The ZIP file must contain one .csv file");
    }

    const imageMap = new Map();
    for (const entry of entries) {
        const ext = entry.entryName.toLowerCase().slice(entry.entryName.lastIndexOf("."));
        if (!IMAGE_EXTENSIONS.includes(ext)) continue;
        imageMap.set(basenameNoExt(entry.entryName), {
            buffer: entry.getData(),
            originalname: entry.entryName.split("/").pop(),
            mimetype: MIME_BY_EXTENSION[ext],
        });
    }

    return { csvText: csvEntry.getData().toString("utf-8"), imageMap };
};

const isHttpUrl = (value) => /^https?:\/\/.+/i.test(value);

const parseBoolField = (value) => {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sí"].includes(v)) return true;
    if (["false", "0", "no"].includes(v)) return false;
    return undefined;
};

// Downloads an image referenced by URL for a bulk row. Bounded by a timeout
// and a size cap so one bad/slow URL can't stall the whole (sequential)
// batch - the row's product has already been created by the time this runs,
// so a failure here becomes a non-fatal image warning, not a row failure.
const MAX_IMAGE_URL_BYTES = 5 * 1024 * 1024;

const downloadImageFromUrl = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
        throw new Error(`Could not download image (HTTP ${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
        throw new Error("URL does not point to an image");
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_URL_BYTES) {
        throw new Error("Image exceeds the 5MB limit");
    }
    return {
        buffer: Buffer.from(arrayBuffer),
        originalname: url.split("/").pop() || "image",
        mimetype: contentType,
    };
};

export const bulkUploadProducts = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new ApiError(400, "CSV or ZIP file is required"));
    }

    const originalName = req.file.originalname.toLowerCase();
    const isZip =
        originalName.endsWith(".zip") ||
        req.file.mimetype === "application/zip" ||
        req.file.mimetype === "application/x-zip-compressed";
    const isCSV =
        !isZip &&
        (req.file.mimetype === "text/csv" ||
            req.file.mimetype === "application/csv" ||
            req.file.mimetype === "application/vnd.ms-excel" ||
            originalName.endsWith(".csv"));

    if (!isCSV && !isZip) {
        return next(new ApiError(400, "Only CSV or ZIP files are accepted"));
    }

    let csvText;
    let imageMap = new Map();

    try {
        if (isZip) {
            ({ csvText, imageMap } = extractZipContents(req.file.buffer));
        } else {
            csvText = req.file.buffer
                ? req.file.buffer.toString("utf-8")
                : fs.readFileSync(req.file.path, "utf-8");
        }
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        return next(new ApiError(400, "Could not read the uploaded file"));
    }

    const { headers, rows } = parseCSV(csvText);

    if (rows.length === 0) {
        return next(new ApiError(400, "CSV file is empty or has no data rows"));
    }

    const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
        return next(
            new ApiError(
                400,
                `CSV is missing required columns: ${missingColumns.join(", ")}`
            )
        );
    }

    if (rows.length > 500) {
        return next(
            new ApiError(
                400,
                "Batch size limit exceeded. Maximum 500 rows per upload."
            )
        );
    }

    const userId = req.user.prismaId;

    const [availableCategories, allUnits] = await Promise.all([
        prisma.category.findMany({
            where: req.user.role === "admin" ? {} : { createdById: userId },
            select: {
                id: true,
                categoryName: true,
            },
        }),
        prisma.unit.findMany({
            where: req.user.role === "admin" ? {} : { createdById: userId },
            select: {
                id: true,
                unitName: true,
            },
        }),
    ]);

    const categoryMap = new Map(
        availableCategories.map((c) => [c.categoryName.toLowerCase(), c.id])
    );
    const unitMap = new Map(allUnits.map((u) => [u.unitName.toLowerCase(), u.id]));

    const incomingCodes = rows
        .map((r) => r.product_code?.trim()?.toUpperCase())
        .filter(Boolean);

    const existingProducts = incomingCodes.length
        ? await prisma.product.findMany({
              where: {
                  createdById: userId,
                  productCode: { in: incomingCodes },
              },
              select: { productCode: true },
          })
        : [];

    const existingCodeSet = new Set(existingProducts.map((p) => p.productCode));

    const errors = [];
    const validProducts = [];
    const seenCodesInBatch = new Set();

    // Applies one optional CSV column to `rowErrors`/`data` only when the
    // column is actually present in the file, mirroring the
    // `...(x !== undefined && {...})` pattern createProduct uses for the
    // same fields in product.controller.js.
    const applyOptionalFields = (row, headers, data, rowErrors) => {
        const has = (col) => headers.includes(col) && row[col]?.trim();

        if (has("sku")) data.sku = row.sku.trim();
        if (has("barcode")) data.barcode = row.barcode.trim();
        if (has("brand")) data.brand = row.brand.trim();

        if (has("status")) {
            const status = row.status.trim();
            if (!PRODUCT_STATUSES.includes(status)) {
                rowErrors.push(`status must be one of: ${PRODUCT_STATUSES.join(", ")}`);
            } else {
                data.status = status;
            }
        }

        if (has("stock")) {
            const stock = Number(row.stock);
            if (!Number.isInteger(stock) || stock < 0) {
                rowErrors.push("stock must be a non-negative integer");
            } else {
                data.stock = stock;
            }
        }

        if (has("low_stock_threshold")) {
            const threshold = Number(row.low_stock_threshold);
            if (!Number.isInteger(threshold) || threshold < 0) {
                rowErrors.push("low_stock_threshold must be a non-negative integer");
            } else {
                data.lowStockThreshold = threshold;
            }
        }

        if (has("tax_code")) data.taxCode = row.tax_code.trim();

        if (has("tax_rate")) {
            const taxRate = Number(row.tax_rate);
            if (Number.isNaN(taxRate) || taxRate < 0) {
                rowErrors.push("tax_rate must be a non-negative number");
            } else {
                data.taxRate = taxRate;
            }
        }

        if (has("tax_treatment")) {
            const taxTreatment = row.tax_treatment.trim();
            if (!TAX_TREATMENTS.includes(taxTreatment)) {
                rowErrors.push(`tax_treatment must be one of: ${TAX_TREATMENTS.join(", ")}`);
            } else {
                data.taxTreatment = taxTreatment;
            }
        }

        if (has("is_physical")) {
            const isPhysical = parseBoolField(row.is_physical);
            if (isPhysical === undefined) {
                rowErrors.push("is_physical must be true/false");
            } else {
                data.isPhysical = isPhysical;
            }
        }

        if (has("is_fragile")) {
            const isFragile = parseBoolField(row.is_fragile);
            if (isFragile === undefined) {
                rowErrors.push("is_fragile must be true/false");
            } else {
                data.isFragile = isFragile;
            }
        }

        const numericFields = [
            ["weight_value", "weightValue"],
            ["height_value", "heightValue"],
            ["width_value", "widthValue"],
            ["length_value", "lengthValue"],
        ];
        for (const [col, field] of numericFields) {
            if (has(col)) {
                const value = Number(row[col]);
                if (Number.isNaN(value) || value < 0) {
                    rowErrors.push(`${col} must be a non-negative number`);
                } else {
                    data[field] = value;
                }
            }
        }

        if (has("weight_unit")) {
            const weightUnit = row.weight_unit.trim();
            if (!WEIGHT_UNITS.includes(weightUnit)) {
                rowErrors.push(`weight_unit must be one of: ${WEIGHT_UNITS.join(", ")}`);
            } else {
                data.weightUnit = weightUnit;
            }
        }

        if (has("dimension_unit")) {
            const dimensionUnit = row.dimension_unit.trim();
            if (!DIMENSION_UNITS.includes(dimensionUnit)) {
                rowErrors.push(`dimension_unit must be one of: ${DIMENSION_UNITS.join(", ")}`);
            } else {
                data.dimensionUnit = dimensionUnit;
            }
        }

        if (has("units_per_package")) {
            const unitsPerPackage = Number(row.units_per_package);
            if (!Number.isInteger(unitsPerPackage) || unitsPerPackage < 1) {
                rowErrors.push("units_per_package must be a positive integer");
            } else {
                data.unitsPerPackage = unitsPerPackage;
            }
        }

        if (has("packaging_type")) {
            const packagingType = row.packaging_type.trim();
            if (!PACKAGING_TYPES.includes(packagingType)) {
                rowErrors.push(`packaging_type must be one of: ${PACKAGING_TYPES.join(", ")}`);
            } else {
                data.packagingType = packagingType;
            }
        }
    };

    // Resolves the row's requested image (if any) against the ZIP's image
    // map / a plain URL, without touching the network or R2 yet - that
    // happens after the product row is created, in the insert loop below.
    const resolveImageSource = (row, headers, rowErrors) => {
        const imageFilename = headers.includes("image_filename") ? row.image_filename?.trim() : "";
        const imageUrl = headers.includes("image_url") ? row.image_url?.trim() : "";

        if (imageFilename && imageUrl) {
            rowErrors.push("Provide only one of image_filename or image_url, not both");
            return null;
        }

        if (imageFilename) {
            const match = imageMap.get(basenameNoExt(imageFilename));
            if (!match) {
                rowErrors.push(`image_filename "${imageFilename}" not found in the ZIP file`);
                return null;
            }
            return { type: "zip", ...match };
        }

        if (imageUrl) {
            if (!isHttpUrl(imageUrl)) {
                rowErrors.push("image_url must be a valid http(s) URL");
                return null;
            }
            return { type: "url", url: imageUrl };
        }

        return null;
    };

    rows.forEach((row, index) => {
        const rowNum = index + 2;
        const rowErrors = [];

        const productName = row.product_name?.trim();
        const productCode = row.product_code?.trim()?.toUpperCase();
        const categoryName = row.category_name?.trim();
        const unitName = row.unit_name?.trim();
        const buyingPrice = Number(row.buying_price);
        const sellingPrice = Number(row.selling_price);

        if (!productName) rowErrors.push("product_name is required");
        if (!productCode) {
            rowErrors.push("product_code is required");
        } else if (productCode.length > 40) {
            rowErrors.push("product_code must be 40 characters or less");
        }

        const categoryId = categoryName
            ? categoryMap.get(categoryName.toLowerCase())
            : null;
        if (!categoryName) {
            rowErrors.push("category_name is required");
        } else if (!categoryId) {
            rowErrors.push(`Category "${categoryName}" not found`);
        }

        const unitId = unitName ? unitMap.get(unitName.toLowerCase()) : null;
        if (!unitName) {
            rowErrors.push("unit_name is required");
        } else if (!unitId) {
            rowErrors.push(`Unit "${unitName}" not found`);
        }

        if (!row.buying_price || Number.isNaN(buyingPrice) || buyingPrice < 0) {
            rowErrors.push("buying_price must be a non-negative number");
        }
        if (!row.selling_price || Number.isNaN(sellingPrice) || sellingPrice < 0) {
            rowErrors.push("selling_price must be a non-negative number");
        }
        if (
            !Number.isNaN(buyingPrice) &&
            !Number.isNaN(sellingPrice) &&
            sellingPrice < buyingPrice
        ) {
            rowErrors.push("selling_price must be >= buying_price");
        }

        if (productCode && seenCodesInBatch.has(productCode)) {
            rowErrors.push(`Duplicate product_code "${productCode}" within this file`);
        } else if (productCode) {
            seenCodesInBatch.add(productCode);
        }

        if (productCode && existingCodeSet.has(productCode)) {
            rowErrors.push(`Product with code "${productCode}" already exists`);
        }

        const data = {
            productName,
            productCode,
            categoryId,
            unitId,
            buyingPrice,
            sellingPrice,
            productImage: "default-product.png",
            stock: 0,
            createdById: userId,
        };

        applyOptionalFields(row, headers, data, rowErrors);
        const imageSource = resolveImageSource(row, headers, rowErrors);

        if (rowErrors.length > 0) {
            errors.push({
                row: rowNum,
                product_code: productCode || "N/A",
                errors: rowErrors,
            });
            return;
        }

        validProducts.push({ row: rowNum, data, imageSource });
    });

    if (validProducts.length === 0) {
        return res
            .status(422)
            .json(
                new ApiResponse(
                    422,
                    { inserted: 0, failed: errors.length, errors, imagesFailed: 0, imageErrors: [] },
                    "No valid products to insert. All rows contain errors."
                )
            );
    }

    // enforceEntityLimit only guards the single-product POST /products
    // route - this endpoint bypassed the plan's product cap entirely and
    // could insert up to 500 products per call regardless of plan. Trim to
    // whatever room is actually left instead of rejecting the whole batch.
    let productsToInsert = validProducts;
    if (req.user.role !== "admin") {
        const subscription = await ensureUserSubscription(userId);
        ensureActiveSubscription(subscription);
        const limit = getPlanLimits(getEffectivePlan(subscription)).maxProducts;

        if (limit !== null) {
            const existingCount = await prisma.product.count({
                where: { createdById: userId },
            });
            const remaining = Math.max(0, limit - existingCount);

            if (validProducts.length > remaining) {
                const overflow = validProducts.slice(remaining);
                productsToInsert = validProducts.slice(0, remaining);
                for (const item of overflow) {
                    errors.push({
                        row: item.row,
                        product_code: item.data.productCode,
                        errors: [
                            `Plan limit reached for products. ${subscription.plan} allows up to ${limit}.`,
                        ],
                    });
                }
            }
        }
    }

    let insertedCount = 0;
    const dbErrors = [];
    const imageErrors = [];

    for (const rowItem of productsToInsert) {
        let created;
        try {
            created = await prisma.product.create({ data: rowItem.data });
            insertedCount += 1;
        } catch (error) {
            if (error.code === "P2002") {
                dbErrors.push({
                    row: rowItem.row,
                    product_code: rowItem.data.productCode,
                    errors: [
                        "Duplicate product code, sku or barcode (concurrent upload detected)",
                    ],
                });
            } else {
                console.error(error);
                return next(new ApiError(500, "Something went wrong. Please try again."));
            }
            continue;
        }

        // The product row already exists at this point - an image problem
        // is reported as a warning on an otherwise-successful row, not a
        // reason to fail the row itself.
        if (rowItem.imageSource) {
            try {
                const file =
                    rowItem.imageSource.type === "zip"
                        ? rowItem.imageSource
                        : await downloadImageFromUrl(rowItem.imageSource.url);

                const uploaded = await uploadFile(file, {
                    ownerId: userId,
                    entity: "products",
                });
                if (uploaded) {
                    await attachImage(prisma, created.id, uploaded.url);
                } else {
                    throw new Error("Image upload failed");
                }
            } catch (error) {
                imageErrors.push({
                    row: rowItem.row,
                    product_code: rowItem.data.productCode,
                    errors: [error.message || "Could not upload the product image"],
                });
            }
        }
    }

    const allErrors = [...errors, ...dbErrors];

    if (insertedCount > 0) emitAccountEvent(userId, "product", "created");
    return res.status(207).json(
        new ApiResponse(
            207,
            {
                total: rows.length,
                inserted: insertedCount,
                failed: allErrors.length,
                errors: allErrors,
                imagesFailed: imageErrors.length,
                imageErrors,
            },
            insertedCount > 0
                ? `${insertedCount} product(s) uploaded successfully. ${allErrors.length} row(s) failed.`
                : "Upload failed. No products were inserted."
        )
    );
});
