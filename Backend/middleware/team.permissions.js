import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Fixed set of modules a team role can be granted access to. API keys and
// DIAN/company settings are intentionally NOT here - those stay hard
// owner-only via blockTeamMembers (teamGuard.middleware.js) regardless of
// role, since they affect the whole account rather than day-to-day
// operational data. "billing" IS grantable (unlike API keys) - the owner can
// choose to let a trusted member see/manage the subscription.
//
// "dashboard" used to mirror "reports"; since the 2026-09-28 regrouping it's
// independently grantable (the migration copied each role's reports level
// into it, which is what it already held).
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
    // Create/rename/deactivate Points of Sale (Escala) - unlike billing/API
    // keys this IS grantable to a member (see blockTeamMembers for what
    // stays hard owner-only). A new module key is safe to add without any
    // backfill: an existing role with no row for it reads as "none" via
    // getModuleAccessLevel below, which is the correct default-deny.
    "pointsOfSale",
    // Cash accounts, payments (cartera), and bank reconciliation - handles
    // money movement directly, so it's grantable like any other operational
    // module but deny-by-default (see DEFAULT_MEMBER_ROLE_PERMISSIONS).
    "finance",
    // Read-only chart of accounts / journal entries / period closing (Fase 4,
    // contabilidad automática) - the postings themselves are automatic (see
    // accountingPosting.service.js), this module only gates who can look at
    // the ledger and who can close a period.
    "accounting",
    // Employees, payroll periods/documents, and prestaciones sociales
    // settlements - deny-by-default like finance/accounting, since salary
    // and personal data are the most sensitive records in the account.
    "payroll",
    // Warranty claims (Garantías): registering/tracking a claim and sending
    // the customer a manual update needs "edit"; deleting a claim or
    // touching the notification templates/toggles needs "admin" - see
    // warranty.routes.js for the exact level per endpoint.
    "warranties",
    // --- 2026-09-28 regrouping (migration 20260928180000 copied each role's
    // old level into these, so nobody's effective access changed) ---
    // Sales electronic invoices and credit notes (DIAN), split out of
    // "orders": issue/sync = edit, credit note = admin. Purchase-side DIAN
    // documents (support document, RADIAN) stay under "purchases".
    "einvoicing",
    // Stock adjustments, transfers between locations and production orders,
    // split out of "products" (which keeps the catalog itself).
    "inventory",
    // Discovery Engine findings, split out of "reports".
    "discoveries",
    // Delegated team management ("co-administrador"): view = members,
    // sessions, activity; edit = invite, change a member's role/scope,
    // revoke sessions; admin = create/edit/delete roles. Never lets anyone
    // grant more than they hold themselves - see assertNoEscalation.
    "team",
];

// Modules the UI never shows as an independent toggle - their level always
// mirrors another module's (enforced in normalizePermissionsInput,
// team.service.js, not just in the frontend, so it holds even if someone
// calls the API directly). Keep MODULE_KEYS as the full backend-enforced
// set; use this to filter what a role-editing UI renders.
// Empty since "dashboard" became independently grantable (2026-09-28) - the
// mechanism stays for any future coupling.
export const COUPLED_MODULES = {};

// Modules another module can't work without, at "view" - e.g. an order form
// has to list customers and products. Advisory only (the role editor raises
// them to "view" when the dependent module is granted, and the owner can
// still lower them afterwards); the backend never grants anything implicitly.
export const MODULE_DEPENDENCIES = {
    orders: ["customers", "products"],
    purchases: ["suppliers", "products"],
    products: ["categories", "units"],
    warranties: ["orders", "customers"],
    einvoicing: ["orders", "customers"],
    inventory: ["products"],
};

const LEVEL_ORDER = { none: 0, view: 1, edit: 2, admin: 3 };

export const hasSufficientLevel = (level, minLevel) =>
    (LEVEL_ORDER[level] ?? 0) >= (LEVEL_ORDER[minLevel] ?? 0);

// Single source of truth for the role editor (GET /teams/permission-catalog,
// team.routes.js) - the frontend builds its module list from this instead of
// a hand-copied MODULE_KEYS, which is how "pointsOfSale" once went missing
// from the editor and got silently reset to "none" on every role save.
export const getPermissionCatalog = () => ({
    modules: MODULE_KEYS.filter((key) => !COUPLED_MODULES[key]),
    coupled: COUPLED_MODULES,
    dependencies: MODULE_DEPENDENCIES,
    levels: Object.keys(LEVEL_ORDER),
    // CAPABILITIES is declared further down - only read when this runs.
    capabilities: Object.entries(CAPABILITIES).map(([key, def]) => ({ key, type: def.type, module: def.module })),
});

// Default permission set applied to the auto-created "Miembro" role when a
// team is first created - deny by default. A brand-new invited member sees
// nothing (not even the dashboard, since it's coupled to "reports") until
// the owner explicitly grants access to specific modules (Team > Roles).
// The owner can edit this role or add more roles afterwards
// (PATCH /teams/:id/roles/:roleId).
export const DEFAULT_MEMBER_ROLE_PERMISSIONS = MODULE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: "none" }),
    {}
);

export const OWNER_ROLE_PERMISSIONS = MODULE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: "admin" }),
    {}
);

// Shared by requireModulePermission (Express) and live/socketServer.js
// (WebSocket presence/lock events) so both enforce the exact same rule: the
// account owner (isTeamMember: false) always has full access - rule 4: "El
// owner siempre tiene control total" - and solo/independent users are never
// gated either way. Only an invited team member's role is actually checked.
export const getModuleAccessLevel = async (user, moduleKey) => {
    if (!user?.isTeamMember) {
        return "admin";
    }

    const permission = await prisma.teamRolePermission.findUnique({
        where: {
            roleId_moduleKey: {
                roleId: user.teamRoleId,
                moduleKey,
            },
        },
        select: { level: true },
    });

    return permission?.level ?? "none";
};

export const canAccessModule = async (user, moduleKey, minLevel = "view") =>
    hasSufficientLevel(await getModuleAccessLevel(user, moduleKey), minLevel);

// Spanish labels for the 403 message only - mirrors the frontend's
// t("team.module_X")/t("team.permission_X") keys (constants/teamModules.js)
// so the wording matches what the owner sees in the role editor.
const LEVEL_LABELS_ES = { none: "sin acceso", view: "ver", edit: "editar", admin: "administrar" };
export const MODULE_LABELS_ES = {
    dashboard: "el panel de control",
    products: "productos",
    categories: "categorías",
    units: "unidades",
    customers: "clientes",
    suppliers: "proveedores",
    orders: "pedidos",
    purchases: "compras",
    reports: "reportes",
    billing: "facturación",
    pointsOfSale: "puntos de venta",
    finance: "finanzas",
    accounting: "contabilidad",
    payroll: "nómina",
    warranties: "garantías",
    einvoicing: "facturación electrónica",
    inventory: "inventario",
    discoveries: "descubrimientos",
    team: "el equipo",
};

export const requireModulePermission = (moduleKey, minLevel = "view") =>
    asyncHandler(async (req, _res, next) => {
        if (!(await canAccessModule(req.user, moduleKey, minLevel))) {
            return next(
                new ApiError(
                    403,
                    `Tu rol no tiene permiso para "${LEVEL_LABELS_ES[minLevel] || minLevel}" en ${MODULE_LABELS_ES[moduleKey] || moduleKey}.`
                )
            );
        }

        return next();
    });

// ---------------------------------------------------------------------------
// Capabilities: action-level grants that don't fit the module x level ladder
// (stored as TeamRole.capabilities JSON). Same owner rule as modules - the
// owner and solo users always get FULL_CAPABILITIES; only an invited
// member's role is read. A missing key is denied, so a role created after
// this shipped starts with none of them (roles that existed before got them
// all enabled by the 20260926190000_team_role_capabilities migration).
export const CAPABILITIES = {
    // Sell (order / sales quotation) below the product's list price beyond
    // salesMaxDiscountPct. Without it the backend rejects the line.
    salesPriceOverride: { type: "boolean", module: "orders" },
    // Max discount (0-100 %) under list price allowed WITHOUT
    // salesPriceOverride. 0 = must sell at list price or above.
    salesMaxDiscountPct: { type: "percent", module: "orders" },
    // See buying prices, inventory valuation and margins. Without it those
    // fields are stripped from product/inventory/report responses
    // (stripCostFieldsUnlessAllowed) and the margin report is blocked.
    catalogViewCosts: { type: "boolean", module: "products" },
    // Delete products/variants, categories, units, customers, suppliers and
    // employees - "edit" alone can create and change them but not remove.
    deleteRecords: { type: "boolean", module: "products" },
    // Process returns on sales and purchases (stock + money reversal).
    processReturns: { type: "boolean", module: "orders" },
    // Export reports to PDF / Excel / CSV - "reports: view" alone only shows them.
    reportsExport: { type: "boolean", module: "reports" },
    // "Emitir después" at checkout - leave a sale without its DIAN document
    // for now (Company.einvoiceIssueMode = ask). Issuing later needs only
    // "einvoicing: edit"; deferring is the sensitive part.
    deferEinvoice: { type: "boolean", module: "einvoicing" },
    // Charge sales from the Caja (counter sales and closing a table's tab).
    // Without it a member can still work tables - take orders, send them to
    // the kitchen, print the pre-bill - but not collect: the waiter/cashier
    // split of a restaurant. Existing roles got it ON in the
    // 20261002120000_restaurant_flow migration.
    posCharge: { type: "boolean", module: "orders" },
};

export const FULL_CAPABILITIES = {
    salesPriceOverride: true,
    salesMaxDiscountPct: 100,
    catalogViewCosts: true,
    deleteRecords: true,
    processReturns: true,
    reportsExport: true,
    deferEinvoice: true,
    posCharge: true,
};

export const normalizeCapabilities = (raw) => {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const [key, def] of Object.entries(CAPABILITIES)) {
        if (def.type === "boolean") {
            out[key] = source[key] === true;
        } else {
            const value = Number(source[key]);
            out[key] = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
        }
    }
    return out;
};

// Memoized per request user object - a single request can check more than
// one capability (e.g. every line of an order) without re-querying.
const capabilityCache = new WeakMap();

export const getCapabilities = async (user) => {
    if (!user?.isTeamMember) {
        return FULL_CAPABILITIES;
    }
    if (capabilityCache.has(user)) {
        return capabilityCache.get(user);
    }
    const role = user.teamRoleId
        ? await prisma.teamRole.findUnique({ where: { id: user.teamRoleId }, select: { capabilities: true } })
        : null;
    const capabilities = normalizeCapabilities(role?.capabilities);
    capabilityCache.set(user, capabilities);
    return capabilities;
};

export const requireCapability = (key, message) =>
    asyncHandler(async (req, _res, next) => {
        const capabilities = await getCapabilities(req.user);
        if (capabilities[key] !== true) {
            return next(new ApiError(403, message || "Tu rol no tiene este permiso."));
        }
        return next();
    });

// Response keys that reveal cost: buying prices, weighted-average cost,
// inventory valuation and cost basis. Both snake_case (mapped responses)
// and camelCase (raw Prisma rows some endpoints return) spellings. NOTE:
// OrderDetail's "unitcost" is the SALE price (legacy name), not listed.
const COST_FIELD_KEYS = new Set([
    "buying_price", "buyingPrice",
    "inventory_value", "inventoryValue",
    "unit_cost_applied", "unitCostApplied",
    "value_delta", "valueDelta",
    "value_balance_after", "valueBalanceAfter",
    "average_unit_cost", "averageUnitCost",
    "cost_basis_applied", "costBasisApplied",
    "incoming_unit_cost", "incomingUnitCost",
]);

export const stripCostFields = (value) => {
    if (Array.isArray(value)) return value.map(stripCostFields);
    // Anything with its own toJSON (Prisma Decimal, Date) serializes to a
    // scalar - leave it whole instead of walking its internals.
    if (value && typeof value === "object" && typeof value.toJSON !== "function") {
        const out = {};
        for (const [key, inner] of Object.entries(value)) {
            if (!COST_FIELD_KEYS.has(key)) out[key] = stripCostFields(inner);
        }
        return out;
    }
    return value;
};

// Route middleware: for a member without catalogViewCosts, scrub cost keys
// out of whatever this route responds with. Wraps res.json once, so every
// controller behind it is covered without touching each serializer.
export const stripCostFieldsUnlessAllowed = asyncHandler(async (req, res, next) => {
    const capabilities = await getCapabilities(req.user);
    if (!capabilities.catalogViewCosts) {
        const originalJson = res.json.bind(res);
        res.json = (body) => originalJson(stripCostFields(body));
    }
    return next();
});
