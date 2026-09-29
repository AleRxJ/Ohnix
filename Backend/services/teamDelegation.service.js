import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { MODULE_KEYS, hasSufficientLevel, normalizeCapabilities, CAPABILITIES } from "../middleware/team.permissions.js";

// Delegated team management ("co-administrador", module "team"). The owner
// is never limited here; a member acting through a "team" grant can only
// hand out, change or remove what they themselves hold - otherwise
// "team: admin" alone would let them build an all-admin role and assign it
// to a friend (or to a second account of their own).

const NO_ESCALATION = "No puedes otorgar ni administrar permisos mayores a los de tu propio rol.";

const toGrant = (role) => ({
    levels: Object.fromEntries(MODULE_KEYS.map((key) => [key, role?.permissions?.find((p) => p.moduleKey === key)?.level ?? "none"])),
    capabilities: normalizeCapabilities(role?.capabilities),
});

// Plain input ({ permissions: {module: level}, capabilities }) -> grant shape.
export const grantFromInput = ({ permissions, capabilities }) => ({
    levels: Object.fromEntries(MODULE_KEYS.map((key) => [key, ["none", "view", "edit", "admin"].includes(permissions?.[key]) ? permissions[key] : "none"])),
    capabilities: normalizeCapabilities(capabilities),
});

export const isOwnerActor = (req) => req.team?.ownerId === req.user?.actorId;

export const loadRoleGrant = async (teamId, roleId) => {
    const role = await prisma.teamRole.findFirst({
        where: { id: roleId, teamId },
        include: { permissions: true },
    });
    if (!role) throw new ApiError(404, "Rol no encontrado");
    return { role, grant: toGrant(role) };
};

const loadActorGrant = async (req) => {
    if (!req.user?.teamRoleId) throw new ApiError(403, NO_ESCALATION);
    return (await loadRoleGrant(req.team.id, req.user.teamRoleId)).grant;
};

// True when `target` gives nothing `actor` doesn't have.
export const grantWithin = (actor, target) => {
    for (const key of MODULE_KEYS) {
        if (!hasSufficientLevel(actor.levels[key], target.levels[key])) return false;
    }
    for (const [key, def] of Object.entries(CAPABILITIES)) {
        if (def.type === "boolean") {
            if (target.capabilities[key] && !actor.capabilities[key]) return false;
        } else if (key === "salesMaxDiscountPct") {
            // Free pricing already covers any discount cap.
            if (!actor.capabilities.salesPriceOverride && target.capabilities[key] > actor.capabilities[key]) return false;
        }
    }
    return true;
};

// Throws unless the actor is the owner or `target` stays within their own
// role. Also blocks acting on one's own role (raising it, or lowering a
// peer who shares it, would both go through here).
export const assertCanDelegate = async (req, target, { roleId = null } = {}) => {
    if (isOwnerActor(req)) return;
    if (roleId && roleId === req.user.teamRoleId) {
        throw new ApiError(403, "No puedes modificar tu propio rol; pídeselo al dueño de la cuenta.");
    }
    if (!grantWithin(await loadActorGrant(req), target)) throw new ApiError(403, NO_ESCALATION);
};

// For actions on another member (change role/scope, remove, sessions):
// never the owner, never yourself, and never someone whose role exceeds
// yours. Returns the membership for the caller's convenience.
export const assertCanManageMember = async (req, userId) => {
    if (isOwnerActor(req)) return null;
    if (userId === req.team.ownerId) throw new ApiError(403, "Solo el dueño de la cuenta puede gestionar su propio acceso.");
    if (userId === req.user.actorId) throw new ApiError(403, "No puedes cambiar tu propio acceso; pídeselo al dueño de la cuenta.");
    const membership = await prisma.teamMember.findFirst({
        where: { teamId: req.team.id, userId, status: "active" },
        select: { roleId: true },
    });
    if (!membership) throw new ApiError(404, "Miembro no encontrado");
    const { grant } = await loadRoleGrant(req.team.id, membership.roleId);
    if (!grantWithin(await loadActorGrant(req), grant)) throw new ApiError(403, NO_ESCALATION);
    return membership;
};

// A member with a restricted Point-of-Sale scope can't hand out locations
// they can't see themselves.
export const assertScopeWithinActor = (req, { scopeAll, pointOfSaleIds }) => {
    if (isOwnerActor(req) || req.user.posScopeAll) return;
    if (scopeAll) throw new ApiError(403, "No puedes dar acceso a todos los puntos de venta si tú no lo tienes.");
    const own = new Set(req.user.posScopeIds || []);
    if ((pointOfSaleIds || []).some((id) => !own.has(id))) {
        throw new ApiError(403, "Solo puedes asignar puntos de venta a los que tú tienes acceso.");
    }
};
