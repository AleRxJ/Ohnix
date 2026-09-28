// Starting points for a new role (RoleFormModal's "start from template").
// Only pre-fills the form - the owner reviews and saves it like any other
// role, and anything not listed here stays "none" / capability off.
// Keys match Backend MODULE_KEYS; labels are team.template_<key>.
export const ROLE_TEMPLATES = [
    {
        key: "cashier",
        permissions: { orders: "edit", customers: "edit", products: "view", categories: "view", units: "view", warranties: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false },
    },
    {
        key: "store_supervisor",
        // orders "admin": cancel completed sales and issue credit notes.
        permissions: { orders: "admin", customers: "edit", products: "edit", categories: "view", units: "view", warranties: "edit", reports: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 15, catalogViewCosts: false },
    },
    {
        key: "warehouse",
        permissions: { products: "edit", categories: "view", units: "view", purchases: "view", suppliers: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false },
    },
    {
        key: "buyer",
        permissions: { purchases: "edit", suppliers: "edit", products: "edit", categories: "view", units: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: true },
    },
    {
        key: "accounting_assistant",
        permissions: { finance: "edit", accounting: "edit", reports: "view", orders: "view", purchases: "view", customers: "view", suppliers: "view", products: "view", categories: "view", units: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: true },
    },
    {
        key: "accountant",
        permissions: { accounting: "admin", finance: "admin", payroll: "view", reports: "view", orders: "view", purchases: "view", customers: "view", suppliers: "view", products: "view", categories: "view", units: "view" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: true },
    },
    {
        key: "hr",
        // Prepares payroll; approving/paying a period stays with "admin".
        permissions: { payroll: "edit" },
        capabilities: { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false },
    },
];
