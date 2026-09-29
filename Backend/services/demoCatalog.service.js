// Turns whatever product list a prospect uploads on /agenda-demo into Ohnix
// products - pure functions only (no Prisma), so they're unit-testable and
// reusable by both the admin preview and demoProvisioning.service.js.
//
// Unlike product.bulk.controller.js (strict English template, categories and
// units must already exist), this has to cope with a real SMB's own Excel:
// Spanish headers in any wording, "$ 38.000" prices, no codes at all. The
// spreadsheet itself is parsed in the prospect's browser (Frontend xlsx), so
// what arrives here is only { headers, rows } JSON - validated below.
import { ApiError } from "../utils/ApiError.js";

export const CATALOG_LIMITS = { maxRows: 1000, maxColumns: 40, maxCellLength: 300 };
// Same per-call cap as the regular bulk upload.
export const MAX_IMPORTED_PRODUCTS = 500;

export const CATALOG_FIELDS = ["name", "code", "category", "unit", "cost", "price", "stock", "barcode", "brand", "taxRate"];

// Matched against normalized headers (lowercase, no accents, no punctuation).
// Order inside CATALOG_FIELDS doesn't matter; DETECTION_ORDER does - see below.
const SYNONYMS = {
    name: ["nombre", "producto", "nombre del producto", "nombre producto", "descripcion", "articulo", "item", "product name", "product", "name"],
    code: ["codigo", "cod", "referencia", "ref", "sku", "codigo interno", "product code", "code", "id"],
    category: ["categoria", "linea", "grupo", "familia", "category", "tipo", "departamento"],
    unit: ["unidad", "unidad de medida", "um", "u m", "medida", "unit", "presentacion"],
    cost: ["costo", "coste", "precio de compra", "precio compra", "costo unitario", "valor compra", "valor de compra", "cost", "buying price", "precio costo", "precio de costo"],
    price: ["precio", "precio de venta", "precio venta", "pvp", "valor", "valor venta", "valor de venta", "precio unitario", "price", "selling price", "precio al publico", "precio publico"],
    stock: ["stock", "existencias", "existencia", "cantidad", "inventario", "saldo", "unidades", "qty", "quantity", "disponible"],
    barcode: ["codigo de barras", "codigo barras", "cod barras", "ean", "barcode", "upc"],
    brand: ["marca", "brand", "fabricante"],
    taxRate: ["iva", "iva %", "impuesto", "tarifa iva", "tax", "tax rate", "porcentaje iva"],
};

// More specific fields claim their header first: "código de barras" also
// contains "código", and "precio de compra" also contains "precio".
const DETECTION_ORDER = ["barcode", "cost", "taxRate", "code", "price", "name", "category", "unit", "stock", "brand"];

export const normalizeHeader = (value) =>
    `${value ?? ""}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9%]+/g, " ")
        .trim();

// Returns { field: columnIndex | null } - exact synonym matches win over a
// header that merely contains a synonym as a whole word; each column is
// assigned to at most one field.
export const detectCatalogMapping = (headers = []) => {
    const normalized = headers.map(normalizeHeader);
    const taken = new Set();
    const mapping = Object.fromEntries(CATALOG_FIELDS.map((field) => [field, null]));

    for (const field of DETECTION_ORDER) {
        const synonyms = SYNONYMS[field];
        let best = null;
        normalized.forEach((header, index) => {
            if (!header || taken.has(index)) return;
            let score = 0;
            if (synonyms.includes(header)) score = 3;
            else if (synonyms.some((syn) => ` ${header} `.includes(` ${syn} `))) score = 2;
            if (score && (!best || score > best.score)) best = { index, score };
        });
        if (best) {
            mapping[field] = best.index;
            taken.add(best.index);
        }
    }
    return mapping;
};

// Accepts what a Colombian spreadsheet actually contains: "$ 38.000",
// "38.000,50", "38,000.50", "COP 1.200.000", "19%", or a plain number.
export const parseNumber = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let text = `${value ?? ""}`.trim();
    if (!text) return NaN;
    text = text.replace(/cop|\$|%|\s/gi, "");
    if (!/^-?[\d.,]+$/.test(text)) return NaN;

    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
        // Whichever separator comes last is the decimal one.
        text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    } else if (lastComma !== -1) {
        // "38,000" (thousands) vs "0,19" / "12,5" (decimal).
        const parts = text.split(",");
        text = parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join("");
    } else if (lastDot !== -1) {
        // "38.000" / "1.200.000" are thousands in Colombia; "12.5" is decimal.
        const parts = text.split(".");
        text = parts.length > 2 || parts[1].length === 3 ? parts.join("") : text;
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
};

const toCell = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    if (typeof value === "boolean") return value ? "true" : "false";
    return `${value}`.slice(0, CATALOG_LIMITS.maxCellLength).trim();
};

const isEmptyCell = (value) => value === "" || value === null || value === undefined;

// Validates the { headers, rows } JSON the public form sends. Returns null
// when nothing usable was sent (the file is optional), throws on a payload
// that is present but malformed.
export const sanitizeCatalogPayload = (raw) => {
    if (raw === undefined || raw === null || raw === "") return null;
    let parsed = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new ApiError(400, "The product list could not be read.", [], "", "demo_catalog_invalid");
        }
    }
    if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
        throw new ApiError(400, "The product list could not be read.", [], "", "demo_catalog_invalid");
    }
    if (parsed.headers.length > CATALOG_LIMITS.maxColumns || parsed.rows.length > CATALOG_LIMITS.maxRows) {
        throw new ApiError(
            400,
            `The product list can have at most ${CATALOG_LIMITS.maxRows} rows and ${CATALOG_LIMITS.maxColumns} columns.`,
            [],
            "",
            "demo_catalog_too_large"
        );
    }

    const width = parsed.headers.length;
    const headers = parsed.headers.map((header, index) => `${toCell(header)}` || `Columna ${index + 1}`);
    const rows = parsed.rows
        .filter(Array.isArray)
        .map((row) => Array.from({ length: width }, (_, index) => toCell(row[index])))
        .filter((row) => row.some((cell) => !isEmptyCell(cell)));

    if (!width || rows.length === 0) return null;
    return { headers, rows };
};

const cellText = (row, index) => (index === null || index === undefined ? "" : `${row[index] ?? ""}`.trim());

// Applies a (possibly admin-edited) mapping to the stored rows and returns
// products ready for prisma.product.create, plus per-row problems. `stock`
// is read for display only - opening stock is never written here (see
// demoProvisioning.service.js for why).
export const buildCatalogProducts = (catalog, mapping) => {
    const products = [];
    const errors = [];
    const warnings = [];
    if (!catalog) return { products, errors, warnings, total: 0 };
    if (mapping?.name === null || mapping?.name === undefined) {
        throw new ApiError(400, "Choose which column has the product name.", [], "", "demo_catalog_name_column_required");
    }

    const usedCodes = new Set();
    catalog.rows.forEach((row, index) => {
        const rowNumber = index + 2; // + header row, 1-based like the spreadsheet
        const name = cellText(row, mapping.name).slice(0, 200);
        if (!name) {
            errors.push({ row: rowNumber, message: "missing_name" });
            return;
        }

        let code = cellText(row, mapping.code).toUpperCase().replace(/\s+/g, "-").slice(0, 40);
        if (!code) code = `P${String(index + 1).padStart(4, "0")}`;
        if (usedCodes.has(code)) {
            let suffix = 2;
            while (usedCodes.has(`${code}-${suffix}`)) suffix += 1;
            warnings.push({ row: rowNumber, message: "duplicate_code_renamed", detail: `${code}-${suffix}` });
            code = `${code}-${suffix}`;
        }
        usedCodes.add(code);

        const rawPrice = cellText(row, mapping.price);
        let price = rawPrice ? parseNumber(rawPrice) : 0;
        if (Number.isNaN(price) || price < 0) {
            errors.push({ row: rowNumber, message: "invalid_price", detail: rawPrice });
            return;
        }
        if (!rawPrice) warnings.push({ row: rowNumber, message: "missing_price" });

        const rawCost = cellText(row, mapping.cost);
        let cost = rawCost ? parseNumber(rawCost) : 0;
        if (Number.isNaN(cost) || cost < 0) {
            warnings.push({ row: rowNumber, message: "invalid_cost_ignored", detail: rawCost });
            cost = 0;
        }
        if (price && cost > price) {
            warnings.push({ row: rowNumber, message: "cost_above_price" });
        }

        let taxRate = null;
        const rawTax = cellText(row, mapping.taxRate);
        if (rawTax) {
            const parsedTax = parseNumber(rawTax);
            // 0.19 and 19 both mean 19%.
            const percent = parsedTax > 0 && parsedTax < 1 ? parsedTax * 100 : parsedTax;
            if (Number.isNaN(percent) || percent < 0 || percent > 100) {
                warnings.push({ row: rowNumber, message: "invalid_tax_ignored", detail: rawTax });
            } else {
                taxRate = Math.round(percent * 100) / 100;
            }
        }

        const stock = parseNumber(cellText(row, mapping.stock));

        products.push({
            row: rowNumber,
            name,
            code,
            category: cellText(row, mapping.category).slice(0, 80) || "General",
            unit: cellText(row, mapping.unit).slice(0, 40) || "Unidad",
            cost: Math.round(cost * 100) / 100,
            price: Math.round(price * 100) / 100,
            taxRate,
            barcode: cellText(row, mapping.barcode).slice(0, 60) || null,
            brand: cellText(row, mapping.brand).slice(0, 80) || null,
            stock: Number.isFinite(stock) ? stock : null,
        });
    });

    if (products.length > MAX_IMPORTED_PRODUCTS) {
        warnings.push({ row: null, message: "truncated", detail: `${products.length - MAX_IMPORTED_PRODUCTS}` });
        products.length = MAX_IMPORTED_PRODUCTS;
    }
    return { products, errors, warnings, total: catalog.rows.length };
};

// Keeps only indexes that point at a real column; anything else becomes null.
export const sanitizeMapping = (mapping, headers) =>
    Object.fromEntries(
        CATALOG_FIELDS.map((field) => {
            const value = mapping?.[field];
            const index = value === null || value === undefined || value === "" ? null : Number(value);
            return [field, Number.isInteger(index) && index >= 0 && index < headers.length ? index : null];
        })
    );
