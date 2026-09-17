// Same priority order as the sidebar (data/index.jsx's getMenuItems) so
// "first accessible module" and "first visible nav item" always agree.
const MODULE_ROUTES = [
    { moduleKey: "dashboard", path: "/dashboard" },
    { moduleKey: "orders", path: "/orders" },
    { moduleKey: "purchases", path: "/quotations" },
    { moduleKey: "customers", path: "/customers" },
    { moduleKey: "products", path: "/products" },
    { moduleKey: "categories", path: "/categories" },
    { moduleKey: "suppliers", path: "/suppliers" },
    { moduleKey: "finance", path: "/finance" },
    { moduleKey: "accounting", path: "/accounting" },
    { moduleKey: "reports", path: "/reports" },
    { moduleKey: "billing", path: "/integrations" },
];

// hasPermission (from useTeam()) already returns true unconditionally for
// the owner and for solo/independent users (no team at all) - only an
// invited member with a restricted role can ever fail every check here, so
// this naturally lands everyone else on "/dashboard" first, same as before.
// Falls back to "/team" (never permission-gated - any active member can
// always see their own team) for a member who hasn't been granted access to
// anything yet, rather than sending them to a page that just 403s.
export const getFirstAccessibleRoute = (hasPermission) => {
    for (const { moduleKey, path } of MODULE_ROUTES) {
        if (hasPermission(moduleKey, "view")) return path;
    }
    return "/team";
};
