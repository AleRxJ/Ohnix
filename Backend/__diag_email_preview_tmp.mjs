import lowStockScheduler from "./utils/lowStockScheduler.js";

const products = [
    { productName: "Producto de práctica", productCode: "PRX85", stock: 0, category: { categoryName: "Categoría de práctica" } },
];

const htmlEs = lowStockScheduler.buildLowStockEmailHtml("alejo", products, { locale: "es" });
const htmlEn = lowStockScheduler.buildLowStockEmailHtml("alejo", products, { locale: "en" });
const htmlSample = lowStockScheduler.buildLowStockEmailHtml("alejo", products, { locale: "es", isSample: true });

import fs from "fs";
fs.writeFileSync("__preview_es.html", htmlEs);
fs.writeFileSync("__preview_en.html", htmlEn);
fs.writeFileSync("__preview_sample.html", htmlSample);
console.log("Rendered OK, no exceptions thrown.");
