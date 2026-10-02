// Starting points for a new role (RoleFormModal's "start from template").
// Only pre-fills the form - the owner reviews and saves it like any other
// role, and anything not listed here stays "none" / capability off.
// Keys match Backend MODULE_KEYS; labels are team.template_<key>.
// Backend/test/teamPermissionCatalog.test.js checks every template against
// the real module list, MODULE_DEPENDENCIES and the locale files.
const NONE = { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false, deleteRecords: false, processReturns: false, reportsExport: false, deferEinvoice: false, posCharge: false };

export const ROLE_TEMPLATES = [
    {
        key: "cashier",
        permissions: { dashboard: "view", orders: "edit", einvoicing: "edit", customers: "edit", products: "view", categories: "view", units: "view", warranties: "view" },
        capabilities: { ...NONE, posCharge: true },
    },
    {
        key: "waiter",
        // Restaurant: works tables (open, add, send to kitchen, pre-bill)
        // but doesn't collect - posCharge stays off, the cashier charges.
        permissions: { orders: "edit", customers: "view", products: "view", categories: "view", units: "view" },
        capabilities: NONE,
    },
    {
        key: "kitchen",
        // Kitchen display (/pos/cocina): sees comandas and marks them
        // preparing/ready. Same data access as a waiter, never charges.
        permissions: { orders: "edit", customers: "view", products: "view", categories: "view", units: "view" },
        capabilities: NONE,
    },
    {
        key: "store_supervisor",
        // orders "admin": cancel completed sales; einvoicing "admin": credit notes.
        permissions: {
            dashboard: "view", orders: "admin", einvoicing: "admin", customers: "edit", products: "edit", categories: "view", units: "view",
            inventory: "edit", warranties: "edit", reports: "view",
        },
        capabilities: { ...NONE, salesMaxDiscountPct: 15, processReturns: true, reportsExport: true, posCharge: true },
    },
    {
        key: "warehouse",
        permissions: { inventory: "edit", products: "view", categories: "view", units: "view", purchases: "view", suppliers: "view" },
        capabilities: NONE,
    },
    {
        key: "buyer",
        permissions: { purchases: "edit", suppliers: "edit", products: "edit", categories: "view", units: "view", inventory: "view" },
        capabilities: { ...NONE, catalogViewCosts: true, processReturns: true },
    },
    {
        key: "accounting_assistant",
        permissions: {
            dashboard: "view", finance: "edit", accounting: "edit", reports: "view", orders: "view", einvoicing: "view", purchases: "view",
            customers: "view", suppliers: "view", products: "view", categories: "view", units: "view",
        },
        capabilities: { ...NONE, catalogViewCosts: true, reportsExport: true },
    },
    {
        key: "accountant",
        permissions: {
            dashboard: "view", accounting: "admin", finance: "admin", einvoicing: "admin", payroll: "view", reports: "view", orders: "view",
            purchases: "view", customers: "view", suppliers: "view", products: "view", categories: "view", units: "view", inventory: "view",
        },
        capabilities: { ...NONE, catalogViewCosts: true, reportsExport: true },
    },
    {
        key: "hr",
        // Prepares payroll; approving/paying a period stays with "admin".
        permissions: { payroll: "edit" },
        capabilities: NONE,
    },
    {
        key: "co_admin",
        // Manages people and roles - but never above their own role (see
        // Backend teamDelegation.service.js), so pair it with the modules
        // they should be able to hand out.
        permissions: { dashboard: "view", team: "admin", reports: "view" },
        capabilities: NONE,
    },
];
