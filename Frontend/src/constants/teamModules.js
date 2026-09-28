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
];

// "dashboard" always mirrors "reports" (see COUPLED_MODULES on the backend) -
// the role-permission editor UI never shows it as its own toggle.
export const VISIBLE_MODULE_KEYS = MODULE_KEYS.filter((key) => key !== "dashboard");

export const PERMISSION_LEVELS = ["none", "view", "edit", "admin"];

// Offline/first-render fallback for Backend MODULE_DEPENDENCIES - the live
// value comes from GET /teams/permission-catalog (usePermissionCatalog).
export const MODULE_DEPENDENCIES = {
    orders: ["customers", "products"],
    purchases: ["suppliers", "products"],
    products: ["categories", "units"],
    warranties: ["orders", "customers"],
};
