// Mirror of Backend MODULE_KEYS (middleware/team.permissions.js) — keep in sync.
export const MODULE_KEYS = [
    "dashboard",
    "products",
    "categories",
    "units",
    "customers",
    "suppliers",
    "orders",
    "purchases",
    "reports",
    "billing",
    "pointsOfSale",
    "finance",
    "accounting",
    "payroll",
    "warranties",
    // 2026-09-28 regrouping - see Backend team.permissions.js.
    "einvoicing",
    "inventory",
    "discoveries",
    "team",
];

// Every module is grantable on its own since "dashboard" stopped mirroring
// "reports" (2026-09-28). Kept as a separate export for the editor.
export const VISIBLE_MODULE_KEYS = MODULE_KEYS;

export const PERMISSION_LEVELS = ["none", "view", "edit", "admin"];

// Offline/first-render fallback for Backend MODULE_DEPENDENCIES - the live
// value comes from GET /teams/permission-catalog (usePermissionCatalog).
export const MODULE_DEPENDENCIES = {
    orders: ["customers", "products"],
    purchases: ["suppliers", "products"],
    products: ["categories", "units"],
    warranties: ["orders", "customers"],
    einvoicing: ["orders", "customers"],
    inventory: ["products"],
};

// How the role editor groups modules by business area. A module the backend
// catalog adds later but isn't listed here falls into an "other" group, so
// it's never silently hidden.
export const MODULE_GROUPS = [
    { key: "general", modules: ["dashboard", "reports", "discoveries"] },
    { key: "sales", modules: ["orders", "customers", "einvoicing", "warranties"] },
    { key: "inventory", modules: ["products", "categories", "units", "inventory"] },
    { key: "purchasing", modules: ["purchases", "suppliers"] },
    { key: "finance", modules: ["finance", "accounting", "payroll"] },
    { key: "account", modules: ["billing", "pointsOfSale", "team"] },
];
