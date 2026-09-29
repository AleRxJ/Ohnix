import test from "node:test";
import assert from "node:assert/strict";
import {
    buildCatalogProducts,
    detectCatalogMapping,
    parseNumber,
    sanitizeCatalogPayload,
    sanitizeMapping,
} from "../services/demoCatalog.service.js";

test("parseNumber reads Colombian and international money formats", () => {
    assert.equal(parseNumber("$ 38.000"), 38000);
    assert.equal(parseNumber("COP 1.200.000"), 1200000);
    assert.equal(parseNumber("38.000,50"), 38000.5);
    assert.equal(parseNumber("38,000.50"), 38000.5);
    assert.equal(parseNumber("38,000"), 38000);
    assert.equal(parseNumber("12,5"), 12.5);
    assert.equal(parseNumber("0,19"), 0.19);
    assert.equal(parseNumber("12.5"), 12.5);
    assert.equal(parseNumber("19%"), 19);
    assert.equal(parseNumber(4500), 4500);
    assert.ok(Number.isNaN(parseNumber("gratis")));
    assert.ok(Number.isNaN(parseNumber("")));
});

test("detectCatalogMapping understands real-world Spanish headers", () => {
    const mapping = detectCatalogMapping(["Código de barras", "Referencia", "Nombre del producto", "Línea", "Precio de compra", "Precio Venta", "Existencias", "IVA %"]);
    assert.equal(mapping.barcode, 0);
    assert.equal(mapping.code, 1);
    assert.equal(mapping.name, 2);
    assert.equal(mapping.category, 3);
    assert.equal(mapping.cost, 4);
    assert.equal(mapping.price, 5);
    assert.equal(mapping.stock, 6);
    assert.equal(mapping.taxRate, 7);
    assert.equal(mapping.unit, null);
});

test("sanitizeCatalogPayload trims, pads and drops empty rows", () => {
    const catalog = sanitizeCatalogPayload(JSON.stringify({ headers: ["Nombre", "Precio"], rows: [["Café", "38.000", "extra"], ["", ""], ["Taza"]] }));
    assert.deepEqual(catalog, { headers: ["Nombre", "Precio"], rows: [["Café", "38.000"], ["Taza", ""]] });
    assert.equal(sanitizeCatalogPayload(""), null);
    assert.throws(() => sanitizeCatalogPayload("{not json"), (error) => error.code === "demo_catalog_invalid");
});

test("buildCatalogProducts fills defaults, dedupes codes and reports bad rows", () => {
    const catalog = {
        headers: ["Nombre", "Código", "Precio", "Costo", "IVA"],
        rows: [
            ["Café especial 500 g", "caf 01", "$ 38.000", "22.000", "0,19"],
            ["Filtros x100", "CAF-01", "12.000", "", ""],
            ["", "X1", "1.000", "", ""],
            ["Molino", "", "no sé", "", ""],
            ["Taza", "", "", "", "19"],
        ],
    };
    const mapping = sanitizeMapping(detectCatalogMapping(catalog.headers), catalog.headers);
    const { products, errors, warnings } = buildCatalogProducts(catalog, mapping);

    assert.equal(products.length, 3);
    assert.deepEqual(
        { name: products[0].name, code: products[0].code, price: products[0].price, cost: products[0].cost, taxRate: products[0].taxRate, category: products[0].category, unit: products[0].unit },
        { name: "Café especial 500 g", code: "CAF-01", price: 38000, cost: 22000, taxRate: 19, category: "General", unit: "Unidad" }
    );
    assert.equal(products[1].code, "CAF-01-2");
    assert.equal(products[2].code, "P0005");
    assert.equal(products[2].price, 0);
    assert.deepEqual(errors.map((e) => e.message), ["missing_name", "invalid_price"]);
    assert.ok(warnings.some((w) => w.message === "duplicate_code_renamed"));
    assert.ok(warnings.some((w) => w.message === "missing_price"));
});

test("buildCatalogProducts requires a name column", () => {
    assert.throws(() => buildCatalogProducts({ headers: ["A"], rows: [["x"]] }, { name: null }));
});
