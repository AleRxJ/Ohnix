import { db, MIRROR_ENTITIES } from "./db.js";

// Human-readable descriptions of outbox entries, shared by the sync queue
// (SyncStatusIndicator.jsx) and the conflicts drawer (ConflictsPanel.jsx) so
// both name the same change the same way. Plain es/en maps (not i18n keys)
// on purpose - same pattern ConflictsPanel always used for these labels.

// Per mirrored entity - keep in sync with db.js's MIRROR_ENTITIES. Falls
// back to the raw entity key for anything not listed.
export const ENTITY_LABELS = {
    products: { es: "Producto", en: "Product" },
    categories: { es: "Categoría", en: "Category" },
    units: { es: "Unidad", en: "Unit" },
    customers: { es: "Cliente", en: "Customer" },
    suppliers: { es: "Proveedor", en: "Supplier" },
    orders: { es: "Pedido", en: "Order" },
    purchases: { es: "Compra", en: "Purchase" },
    cashAccounts: { es: "Cuenta de caja", en: "Cash account" },
    pointsOfSale: { es: "Punto de venta", en: "Point of sale" },
    stockTransfers: { es: "Traslado de stock", en: "Stock transfer" },
    locationStockSummaries: { es: "Stock por ubicación", en: "Location stock" },
    purchaseQuotations: { es: "Cotización de compra", en: "Purchase quotation" },
    salesQuotations: { es: "Cotización de venta", en: "Sales quotation" },
    receiptAcknowledgments: { es: "Acuse de recibo", en: "Receipt acknowledgment" },
    productBatches: { es: "Lote", en: "Batch" },
    productionOrders: { es: "Orden de producción", en: "Production order" },
    employees: { es: "Empleado", en: "Employee" },
    payrollPeriods: { es: "Período de nómina", en: "Payroll period" },
    warranties: { es: "Garantía", en: "Warranty" },
};

export const OP_LABELS = {
    create: { es: "Creación", en: "Created" },
    update: { es: "Edición", en: "Edited" },
    delete: { es: "Eliminación", en: "Deleted" },
    custom: { es: "Acción", en: "Action" },
};

// "custom" entries are one-off actions against a specific endpoint - the
// URL is the only thing that says which one, so name them from it.
const CUSTOM_ACTIONS = [
    { match: /\/payments$/, es: "Registro de pago", en: "Payment recorded" },
    { match: /\/finance\/transfers$/, es: "Transferencia entre cuentas", en: "Transfer between accounts" },
    { match: /\/finance\/adjustments$/, es: "Ajuste de caja", en: "Cash adjustment" },
    { match: /aceptacion-expresa$/, es: "Aceptación expresa", en: "Express acceptance" },
    { match: /reclamo$/, es: "Reclamo", en: "Claim" },
    { match: /transfer-stock$/, es: "Traslado entre ubicaciones", en: "Transfer between locations" },
];

// For custom actions whose entity isn't where the named record lives
// (a stock transfer is *about* a product, a receipt acknowledgment *about*
// a purchase), look the record up in this table instead.
const LOOKUP_TABLE = {
    stockTransfers: "products",
    receiptAcknowledgments: "purchases",
};

// Best-effort label for *which* record this was, tried against the field
// names different entities' payloads/mirror rows actually use - there's no
// single shared "name" field across all of them.
const RECORD_LABEL_FIELDS = [
    "name", "full_name", "category_name", "product_name", "customer_name", "supplier_name",
    "order_number", "order_no", "purchase_no", "quotation_no", "quotation_number", "account_name",
];

const labelFromObject = (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    for (const field of RECORD_LABEL_FIELDS) {
        const value = data[field];
        if (value && (typeof value === "string" || typeof value === "number")) return String(value);
    }
    if (data.first_name) return [data.first_name, data.last_name].filter(Boolean).join(" ");
    return null;
};

// FormData payloads are stored as [key, value] entries (entityQueue.js).
const requestData = (entry) => {
    const data = entry?.request?.data;
    if (entry?.request?.isFormData && Array.isArray(data)) return Object.fromEntries(data);
    return data;
};

// Synchronous: whatever the request body itself says (the conflicts drawer
// only ever needed this).
export const describeRecord = (entry) => labelFromObject(requestData(entry));

const idFromUrl = (url = "") => {
    const segments = url.split("?")[0].split("/").filter(Boolean);
    // First segment shaped like a record id (cuid, legacy Mongo ObjectId,
    // UUID, or an offline temp id), e.g. /products/<id>/transfer-stock.
    return segments.find((segment, index) => index > 0 && /^(?:c[a-z0-9]{20,}|[0-9a-f]{24}|[0-9a-f-]{36}|offline-.+)$/i.test(segment)) || null;
};

// Async: also resolves the name from the local mirror when the request body
// doesn't carry one (edits send partial fields, deletes send nothing).
export async function resolveRecordLabel(entry) {
    const fromBody = describeRecord(entry);
    if (fromBody) return fromBody;
    const id = entry.recordId || entry.localTempId || idFromUrl(entry?.request?.url);
    const table = LOOKUP_TABLE[entry.entity] || entry.entity;
    if (!id || !MIRROR_ENTITIES.includes(table)) return null;
    try {
        return labelFromObject(await db.table(table).get(id));
    } catch {
        return null;
    }
}

export const entityLabel = (entry, lang) => ENTITY_LABELS[entry.entity]?.[lang] || entry.entity;

export const operationLabel = (entry, lang) => {
    if (entry.opType === "custom") {
        const action = CUSTOM_ACTIONS.find(({ match }) => match.test(entry?.request?.url || ""));
        if (action) return action[lang];
    }
    return OP_LABELS[entry.opType]?.[lang] || entry.opType;
};
