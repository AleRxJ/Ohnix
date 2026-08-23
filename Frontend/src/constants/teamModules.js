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
    "finance",
];

// "dashboard" always mirrors "reports" (see COUPLED_MODULES on the backend) -
// the role-permission editor UI never shows it as its own toggle.
export const VISIBLE_MODULE_KEYS = MODULE_KEYS.filter((key) => key !== "dashboard");

export const PERMISSION_LEVELS = ["none", "view", "edit", "admin"];
