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
// "dashboard" is not independently grantable - see COUPLED_TO_REPORTS below.
// It stays a real module (its own requireModulePermission check on
// GET /reports/dashboard) purely so the dashboard overview and the reports
// section always turn on and off together, never one without the other.
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
];

// Modules the UI never shows as an independent toggle - their level always
// mirrors another module's (enforced in normalizePermissionsInput,
// team.service.js, not just in the frontend, so it holds even if someone
// calls the API directly). Keep MODULE_KEYS as the full backend-enforced
// set; use this to filter what a role-editing UI renders.
export const COUPLED_MODULES = { dashboard: "reports" };

const LEVEL_ORDER = { none: 0, view: 1, edit: 2, admin: 3 };

export const hasSufficientLevel = (level, minLevel) =>
    (LEVEL_ORDER[level] ?? 0) >= (LEVEL_ORDER[minLevel] ?? 0);

// Default permission set applied to the auto-created "Miembro" role when a
// team is first created - deny by default. A brand-new invited member sees
// nothing (not even the dashboard, since it's coupled to "reports") until
// the owner explicitly grants access to specific modules (Team > Roles).
// The owner can edit this role or add more roles afterwards
// (PATCH /teams/:id/roles/:roleId).
export const DEFAULT_MEMBER_ROLE_PERMISSIONS = {
    dashboard: "none",
    products: "none",
    categories: "none",
    units: "none",
    customers: "none",
    suppliers: "none",
    orders: "none",
    purchases: "none",
    reports: "none",
    billing: "none",
};

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
const MODULE_LABELS_ES = {
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
