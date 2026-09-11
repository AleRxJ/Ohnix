import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { issueAuthTokens } from "../utils/authTokens.js";
import { listSessions, revokeAllSessions, revokeSession } from "../utils/sessionStore.js";
import { publishPosScopeChange } from "../utils/posScopeStore.js";
import {
    ensureUserSubscription,
    getEffectivePlan,
    getTeamSeatLimit,
    planSupportsTeams,
} from "../middleware/pricing.middleware.js";
import {
    MODULE_KEYS,
    COUPLED_MODULES,
    DEFAULT_MEMBER_ROLE_PERMISSIONS,
    OWNER_ROLE_PERMISSIONS,
} from "../middleware/team.permissions.js";
import {
    notifyInvitationCreated,
    notifyRoleChanged,
    notifyMemberRemoved,
} from "../utils/teamNotifications.js";

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72h, per spec

// Not derived from a counter or the invitee's email - crypto.randomBytes is
// unguessable, which is what makes the invitation link safe to email as the
// sole credential (rule: "validación de que el token de invitación no sea
// adivinable").
const generateInvitationToken = () => crypto.randomBytes(32).toString("hex");

const normalizeLocale = (value) => {
    const normalized = `${value || ""}`.toLowerCase().trim();
    return normalized.startsWith("en") ? "en" : "es";
};

const logActivity = async (teamId, actorId, action, metadata = {}, targetUserId = null) => {
    try {
        await prisma.teamActivityLog.create({
            data: { teamId, actorId, action, targetUserId, metadata },
        });
    } catch (err) {
        console.error("[team] Failed to log activity:", err?.message);
    }
};

// v1 exclusivity rule (owner's own call, see conversation): block whenever
// the email already has ANY Ohnix account - independent or a past team
// member - rather than trying to distinguish "has their own data" from
// "used to be on a team". Simple, safe, no merge/reactivation flow yet
// (that's the separate "account recovery" idea for a later phase).
const assertEmailInvitable = async (email) => {
    const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (existing) {
        throw new ApiError(
            409,
            "Este correo ya tiene una cuenta en Ohnix y no se puede invitar. No debe tener una cuenta independiente ni pertenecer a otro equipo."
        );
    }
};

const countReservedSeats = async (teamId) => {
    const [activeMembers, pendingInvitations] = await Promise.all([
        prisma.teamMember.count({ where: { teamId, status: "active" } }),
        prisma.teamInvitation.count({
            where: { teamId, status: "pending", expiresAt: { gt: new Date() } },
        }),
    ]);
    return activeMembers + pendingInvitations;
};

// ─── Team ─────────────────────────────────────────────────────────────────

export const createTeam = async ({ ownerId, name }) => {
    const trimmed = `${name || ""}`.trim();
    if (!trimmed) {
        throw new ApiError(400, "El nombre del equipo es obligatorio");
    }

    const existing = await prisma.team.findUnique({ where: { ownerId } });
    if (existing) {
        throw new ApiError(409, "Ya tienes un equipo");
    }

    const subscription = await ensureUserSubscription(ownerId);
    const plan = getEffectivePlan(subscription);
    if (!planSupportsTeams(plan)) {
        throw new ApiError(
            403,
            "La colaboración en equipo requiere el plan Negocio o superior. Actualiza tu plan para crear un equipo."
        );
    }

    // A user already active on someone else's team can't also own one - one
    // account, one role, keeps v1 simple.
    const membership = await prisma.teamMember.findFirst({
        where: { userId: ownerId, status: "active" },
    });
    if (membership) {
        throw new ApiError(409, "Ya eres miembro de otro equipo.");
    }

    const team = await prisma.$transaction(async (tx) => {
        const created = await tx.team.create({ data: { name: trimmed, ownerId } });

        await tx.teamRole.create({
            data: {
                teamId: created.id,
                name: "Owner",
                isOwnerRole: true,
                permissions: {
                    create: MODULE_KEYS.map((moduleKey) => ({
                        moduleKey,
                        level: OWNER_ROLE_PERMISSIONS[moduleKey],
                    })),
                },
            },
        });

        await tx.teamRole.create({
            data: {
                teamId: created.id,
                name: "Miembro",
                isOwnerRole: false,
                permissions: {
                    create: MODULE_KEYS.map((moduleKey) => ({
                        moduleKey,
                        level: DEFAULT_MEMBER_ROLE_PERMISSIONS[moduleKey],
                    })),
                },
            },
        });

        return created;
    });

    await logActivity(team.id, ownerId, "team.created", { name: trimmed });

    return team;
};

export const requireOwnerTeam = async (ownerId) => {
    const team = await prisma.team.findUnique({ where: { ownerId } });
    if (!team) {
        throw new ApiError(404, "Todavía no tienes un equipo. Crea uno primero.");
    }
    return team;
};

export const getTeamById = async (teamId) => {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
        throw new ApiError(404, "Equipo no encontrado");
    }
    return team;
};

// Resolves "the team this request is about" for both the owner (who has no
// TeamMember row) and an active member (whose team is on req.user.teamId).
export const resolveRequestTeam = async (user) => {
    if (user.isTeamOwner) {
        return requireOwnerTeam(user.prismaId);
    }
    if (user.teamId) {
        return getTeamById(user.teamId);
    }
    throw new ApiError(404, "No perteneces a un equipo.");
};

export const renameTeam = async ({ team, actorId, name }) => {
    const trimmed = `${name || ""}`.trim();
    if (!trimmed) {
        throw new ApiError(400, "El nombre del equipo es obligatorio");
    }

    const updated = await prisma.team.update({
        where: { id: team.id },
        data: { name: trimmed },
    });

    await logActivity(team.id, actorId, "team.renamed", { name: trimmed });
    return updated;
};

// Ownership transfer moves the account itself, not just an admin flag:
// every resource currently scoped under the old owner's id (createdById on
// Product/Order/Customer/... - see the Team model comment in schema.prisma)
// is repointed to the new owner, along with the Subscription and API keys,
// so the new owner sees exactly what the old owner saw. The old owner
// becomes a regular member on the team's default role; the new owner's old
// membership row is removed (owners don't have one).
const RESOURCE_MODELS_SCOPED_BY_CREATED_BY = [
    "product",
    "category",
    "unit",
    "customer",
    "supplier",
    "order",
    "purchase",
];

export const transferOwnership = async ({ team, actorId, newOwnerUserId }) => {
    if (newOwnerUserId === team.ownerId) {
        throw new ApiError(400, "Este usuario ya es el owner");
    }

    const newOwnerMembership = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId: newOwnerUserId, status: "active" },
    });
    if (!newOwnerMembership) {
        throw new ApiError(
            400,
            "El nuevo owner debe ser un miembro activo de este equipo"
        );
    }

    const oldOwnerId = team.ownerId;

    const fallbackRole = await prisma.teamRole.findFirst({
        where: { teamId: team.id, isOwnerRole: false },
        orderBy: { createdAt: "asc" },
    });

    const [oldOwnerUser, newOwnerUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: oldOwnerId }, select: { username: true } }),
        prisma.user.findUnique({ where: { id: newOwnerUserId }, select: { username: true } }),
    ]);

    await prisma.$transaction(async (tx) => {
        for (const model of RESOURCE_MODELS_SCOPED_BY_CREATED_BY) {
            await tx[model].updateMany({
                where: { createdById: oldOwnerId },
                data: { createdById: newOwnerUserId },
            });
        }
        await tx.apiKey.updateMany({
            where: { userId: oldOwnerId },
            data: { userId: newOwnerUserId },
        });

        // Subscription.userId is unique - the new owner (previously just a
        // member) never had their own row, since every plan/limit lookup for
        // them already resolved to the old owner's id.
        await tx.subscription.update({
            where: { userId: oldOwnerId },
            data: { userId: newOwnerUserId },
        });

        await tx.teamMember.delete({ where: { id: newOwnerMembership.id } });

        if (fallbackRole) {
            await tx.teamMember.create({
                data: {
                    teamId: team.id,
                    userId: oldOwnerId,
                    roleId: fallbackRole.id,
                    status: "active",
                    invitedById: actorId,
                },
            });
        }

        await tx.team.update({
            where: { id: team.id },
            data: { ownerId: newOwnerUserId },
        });

        await tx.teamActivityLog.create({
            data: {
                teamId: team.id,
                actorId,
                action: "ownership.transferred",
                targetUserId: newOwnerUserId,
                metadata: {
                    fromUserId: oldOwnerId,
                    fromUsername: oldOwnerUser?.username ?? null,
                    targetUsername: newOwnerUser?.username ?? null,
                },
            },
        });
    });

    return getTeamById(team.id);
};

// ─── Roles ────────────────────────────────────────────────────────────────

// Enforced server-side (not just hidden in the role-editor UI) so it holds
// even for a direct API call: "dashboard" always mirrors "reports" - see
// COUPLED_MODULES in team.permissions.js.
const normalizePermissionsInput = (permissions) => {
    const map = {};
    for (const key of MODULE_KEYS) {
        const level = permissions?.[key];
        map[key] = ["none", "view", "edit", "admin"].includes(level) ? level : "none";
    }
    for (const [dependent, source] of Object.entries(COUPLED_MODULES)) {
        map[dependent] = map[source];
    }
    return map;
};

export const listRoles = (team) =>
    prisma.teamRole.findMany({
        where: { teamId: team.id },
        include: { permissions: true },
        orderBy: { createdAt: "asc" },
    });

export const createRole = async ({ team, actorId, name, permissions }) => {
    const trimmed = `${name || ""}`.trim();
    if (!trimmed) {
        throw new ApiError(400, "El nombre del rol es obligatorio");
    }

    const existing = await prisma.teamRole.findFirst({
        where: { teamId: team.id, name: trimmed },
    });
    if (existing) {
        throw new ApiError(409, "Ya existe un rol con este nombre");
    }

    const normalized = normalizePermissionsInput(permissions);
    const role = await prisma.teamRole.create({
        data: {
            teamId: team.id,
            name: trimmed,
            permissions: {
                create: MODULE_KEYS.map((moduleKey) => ({
                    moduleKey,
                    level: normalized[moduleKey],
                })),
            },
        },
        include: { permissions: true },
    });

    await logActivity(team.id, actorId, "role.created", { name: trimmed });
    return role;
};

export const updateRole = async ({ team, actorId, roleId, name, permissions }) => {
    const role = await prisma.teamRole.findFirst({
        where: { id: roleId, teamId: team.id },
        include: { permissions: true },
    });
    if (!role) {
        throw new ApiError(404, "Rol no encontrado");
    }
    if (role.isOwnerRole) {
        throw new ApiError(400, "El rol Owner no se puede editar");
    }

    const trimmed = name !== undefined ? `${name}`.trim() : role.name;
    if (!trimmed) {
        throw new ApiError(400, "El nombre del rol es obligatorio");
    }

    // Diff against the previous permission levels so the activity log shows
    // exactly what changed (module: old level -> new level), not just "role
    // was updated" - this is what let a shared-role edit silently look like
    // nothing happened to the member who lost access.
    const previousLevels = Object.fromEntries(role.permissions.map((p) => [p.moduleKey, p.level]));
    let permissionChanges = [];

    const updated = await prisma.$transaction(async (tx) => {
        if (permissions) {
            const normalized = normalizePermissionsInput(permissions);
            permissionChanges = MODULE_KEYS.filter(
                (moduleKey) => (previousLevels[moduleKey] ?? "none") !== normalized[moduleKey]
            ).map((moduleKey) => ({
                moduleKey,
                from: previousLevels[moduleKey] ?? "none",
                to: normalized[moduleKey],
            }));

            await Promise.all(
                MODULE_KEYS.map((moduleKey) =>
                    tx.teamRolePermission.upsert({
                        where: { roleId_moduleKey: { roleId: role.id, moduleKey } },
                        update: { level: normalized[moduleKey] },
                        create: { roleId: role.id, moduleKey, level: normalized[moduleKey] },
                    })
                )
            );
        }
        return tx.teamRole.update({
            where: { id: role.id },
            data: { name: trimmed },
            include: { permissions: true },
        });
    });

    await logActivity(team.id, actorId, "role.updated", {
        roleId: role.id,
        fromName: role.name,
        toName: trimmed,
        permissionChanges,
    });
    return updated;
};

export const deleteRole = async ({ team, actorId, roleId }) => {
    const role = await prisma.teamRole.findFirst({
        where: { id: roleId, teamId: team.id },
    });
    if (!role) {
        throw new ApiError(404, "Rol no encontrado");
    }
    if (role.isOwnerRole) {
        throw new ApiError(400, "El rol Owner no se puede eliminar");
    }

    const [memberCount, invitationCount] = await Promise.all([
        prisma.teamMember.count({ where: { roleId: role.id, status: "active" } }),
        prisma.teamInvitation.count({ where: { roleId: role.id, status: "pending" } }),
    ]);
    if (memberCount > 0 || invitationCount > 0) {
        throw new ApiError(
            409,
            "No puedes eliminar un rol asignado a miembros activos o invitaciones pendientes. Reasígnalos primero."
        );
    }

    await prisma.teamRole.delete({ where: { id: role.id } });
    await logActivity(team.id, actorId, "role.deleted", { name: role.name });
    return { deleted: true };
};

// ─── Invitations ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createInvitation = async ({ team, actorId, email, roleId }) => {
    const normalizedEmail = `${email || ""}`.toLowerCase().trim();
    if (!EMAIL_RE.test(normalizedEmail)) {
        throw new ApiError(400, "Se requiere un correo válido");
    }

    const role = await prisma.teamRole.findFirst({
        where: { id: roleId, teamId: team.id },
    });
    if (!role) {
        throw new ApiError(404, "Rol no encontrado en este equipo");
    }

    await assertEmailInvitable(normalizedEmail);

    const existingPending = await prisma.teamInvitation.findFirst({
        where: { teamId: team.id, email: normalizedEmail, status: "pending" },
    });
    if (existingPending) {
        throw new ApiError(
            409,
            "Ya existe una invitación pendiente para este correo. Reenvíala en vez de crear una nueva."
        );
    }

    const subscription = await ensureUserSubscription(team.ownerId);
    const seatLimit = getTeamSeatLimit(getEffectivePlan(subscription));
    if (seatLimit === 0) {
        throw new ApiError(
            403,
            "Tu plan actual no incluye asientos de equipo. Actualiza al plan Negocio o superior."
        );
    }
    if (seatLimit !== null) {
        const reserved = await countReservedSeats(team.id);
        if (reserved >= seatLimit) {
            throw new ApiError(
                409,
                `Se alcanzó el límite de asientos (${seatLimit}). Remueve a un miembro o revoca una invitación pendiente antes de invitar a alguien nuevo.`
            );
        }
    }

    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await prisma.teamInvitation.create({
        data: {
            teamId: team.id,
            email: normalizedEmail,
            token,
            roleId: role.id,
            invitedById: actorId,
            expiresAt,
        },
        include: { role: { select: { id: true, name: true } } },
    });

    await logActivity(team.id, actorId, "invitation.created", {
        targetEmail: normalizedEmail,
        roleId: role.id,
    });

    const inviter = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, preferredLanguage: true },
    });

    notifyInvitationCreated({
        team,
        invitation,
        inviterUsername: inviter?.username,
        locale: inviter?.preferredLanguage,
    }).catch((err) => console.error("[team] invitation email failed:", err?.message));

    return invitation;
};

export const listInvitations = (team) =>
    prisma.teamInvitation.findMany({
        where: { teamId: team.id },
        include: { role: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });

export const resendInvitation = async ({ team, actorId, invitationId }) => {
    const invitation = await prisma.teamInvitation.findFirst({
        where: { id: invitationId, teamId: team.id },
    });
    if (!invitation) {
        throw new ApiError(404, "Invitación no encontrada");
    }
    if (invitation.status === "accepted") {
        throw new ApiError(409, "Esta invitación ya fue aceptada");
    }
    if (invitation.status === "revoked") {
        throw new ApiError(409, "Esta invitación fue revocada");
    }

    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const updated = await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { token, expiresAt, status: "pending" },
        include: { role: { select: { id: true, name: true } } },
    });

    await logActivity(team.id, actorId, "invitation.resent", { targetEmail: invitation.email });

    const inviter = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, preferredLanguage: true },
    });

    notifyInvitationCreated({
        team,
        invitation: updated,
        inviterUsername: inviter?.username,
        locale: inviter?.preferredLanguage,
        isResend: true,
    }).catch((err) => console.error("[team] resend email failed:", err?.message));

    return updated;
};

export const revokeInvitation = async ({ team, actorId, invitationId }) => {
    const invitation = await prisma.teamInvitation.findFirst({
        where: { id: invitationId, teamId: team.id },
    });
    if (!invitation) {
        throw new ApiError(404, "Invitación no encontrada");
    }
    if (invitation.status !== "pending") {
        throw new ApiError(409, `No se puede revocar una invitación con estado "${invitation.status}"`);
    }

    const updated = await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "revoked" },
    });

    await logActivity(team.id, actorId, "invitation.revoked", { targetEmail: invitation.email });
    return updated;
};

// Public, read-only - lets the onboarding page show "X invited you to join
// TEAM" before asking the invitee to pick a username/password. Never
// mutates anything, so it's safe to call repeatedly (e.g. on page refresh).
export const previewInvitation = async (token) => {
    if (!`${token || ""}`.trim()) {
        throw new ApiError(400, "El token de invitación es obligatorio");
    }

    const invitation = await prisma.teamInvitation.findUnique({
        where: { token },
        include: {
            team: { select: { name: true } },
            role: { select: { name: true } },
            invitedBy: { select: { username: true } },
        },
    });

    if (!invitation) {
        throw new ApiError(404, "Invitación no encontrada");
    }

    if (invitation.status === "pending" && invitation.expiresAt < new Date()) {
        await prisma.teamInvitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
        invitation.status = "expired";
    }

    return {
        email: invitation.email,
        status: invitation.status,
        teamName: invitation.team.name,
        roleName: invitation.role.name,
        inviterUsername: invitation.invitedBy.username,
        expiresAt: invitation.expiresAt,
    };
};

// Public flow (no auth yet - the token IS the credential). Creates the
// invitee's own login (email/username/password) and immediately logs them
// in, same as a normal registration would.
export const acceptInvitation = async ({
    token,
    username,
    password,
    preferredLanguage,
    deviceId,
    deviceClass,
    deviceInfo,
}) => {
    if (!`${token || ""}`.trim()) {
        throw new ApiError(400, "El token de invitación es obligatorio");
    }
    if (![username, password].every((field) => `${field || ""}`.trim())) {
        throw new ApiError(400, "El nombre de usuario y la contraseña son obligatorios");
    }

    const invitation = await prisma.teamInvitation.findUnique({
        where: { token },
        include: { team: true, role: true },
    });

    if (!invitation) {
        throw new ApiError(404, "Invitación no encontrada");
    }

    if (invitation.status === "pending" && invitation.expiresAt < new Date()) {
        await prisma.teamInvitation.update({
            where: { id: invitation.id },
            data: { status: "expired" },
        });
        throw new ApiError(410, "Esta invitación venció. Pide al owner del equipo que la reenvíe.");
    }

    if (invitation.status !== "pending") {
        throw new ApiError(409, `Esta invitación ya no es válida (${invitation.status}).`);
    }

    // Re-check exclusivity at accept time too - guards the race where the
    // email registered independently between invite creation and acceptance.
    await assertEmailInvitable(invitation.email);

    const normalizedUsername = `${username}`.toLowerCase().trim();
    const existingUsername = await prisma.user.findUnique({
        where: { username: normalizedUsername },
        select: { id: true },
    });
    if (existingUsername) {
        throw new ApiError(409, "Ese nombre de usuario ya está en uso");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarSeed = encodeURIComponent(normalizedUsername || invitation.email);
    const avatarUrl = `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${avatarSeed}`;

    const newUser = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
            data: {
                email: invitation.email,
                username: normalizedUsername,
                password: hashedPassword,
                avatar: avatarUrl,
                // Trusted: they received this invitation on the inbox being
                // invited, which is itself a proof of email ownership - no
                // separate OTP verification step for invited members.
                isVerified: true,
                preferredLanguage: normalizeLocale(preferredLanguage),
            },
        });

        await tx.teamMember.create({
            data: {
                teamId: invitation.teamId,
                userId: createdUser.id,
                roleId: invitation.roleId,
                status: "active",
                invitedById: invitation.invitedById,
            },
        });

        await tx.teamInvitation.update({
            where: { id: invitation.id },
            data: { status: "accepted", acceptedAt: new Date() },
        });

        await tx.teamActivityLog.create({
            data: {
                teamId: invitation.teamId,
                actorId: createdUser.id,
                action: "invitation.accepted",
                targetUserId: createdUser.id,
                metadata: {
                    email: invitation.email,
                    username: createdUser.username,
                    roleId: invitation.roleId,
                    roleName: invitation.role?.name ?? null,
                },
            },
        });

        return createdUser;
    });

    const tokens = await issueAuthTokens(newUser.id, { deviceId, deviceClass, deviceInfo });

    return { user: newUser, team: invitation.team, role: invitation.role, tokens };
};

// ─── Members ──────────────────────────────────────────────────────────────

export const listMembers = async (team) => {
    const [owner, members] = await Promise.all([
        prisma.user.findUnique({
            where: { id: team.ownerId },
            select: { id: true, username: true, email: true, avatar: true, createdAt: true },
        }),
        prisma.teamMember.findMany({
            where: { teamId: team.id, status: "active" },
            include: {
                user: { select: { id: true, username: true, email: true, avatar: true } },
                role: { select: { id: true, name: true } },
                // Only populated when scopeAll is false - see
                // TeamMemberPointOfSale's model comment. Cheap to always
                // include (a full-scope member simply has zero rows here)
                // rather than a second conditional query per member.
                pointsOfSale: { include: { pointOfSale: { select: { id: true, name: true } } } },
            },
            orderBy: { joinedAt: "asc" },
        }),
    ]);

    return [
        {
            userId: owner.id,
            username: owner.username,
            email: owner.email,
            avatar: owner.avatar,
            role: { id: null, name: "Owner" },
            isOwner: true,
            status: "active",
            joinedAt: owner.createdAt,
            // The owner is always full-scope (see pos.permissions.js) -
            // never has TeamMemberPointOfSale rows to read, so this is
            // stated directly rather than queried.
            scopeAll: true,
            pointsOfSale: [],
        },
        ...members.map((m) => ({
            userId: m.user.id,
            username: m.user.username,
            email: m.user.email,
            avatar: m.user.avatar,
            role: m.role,
            isOwner: false,
            status: m.status,
            joinedAt: m.joinedAt,
            scopeAll: m.scopeAll,
            pointsOfSale: m.pointsOfSale.map((row) => row.pointOfSale),
        })),
    ];
};

export const changeMemberRole = async ({ team, actorId, userId, roleId }) => {
    if (userId === team.ownerId) {
        throw new ApiError(400, "El acceso del owner no se puede cambiar. Transfiere la propiedad del equipo en su lugar.");
    }

    const member = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId, status: "active" },
        include: {
            role: { select: { name: true } },
            user: { select: { username: true } },
        },
    });
    if (!member) {
        throw new ApiError(404, "Miembro activo no encontrado");
    }

    const role = await prisma.teamRole.findFirst({
        where: { id: roleId, teamId: team.id },
    });
    if (!role) {
        throw new ApiError(404, "Rol no encontrado en este equipo");
    }

    const updated = await prisma.teamMember.update({
        where: { id: member.id },
        data: { roleId: role.id },
        include: {
            role: { select: { id: true, name: true } },
            user: { select: { username: true, email: true, preferredLanguage: true } },
        },
    });

    await logActivity(
        team.id,
        actorId,
        "member.role_changed",
        {
            targetUsername: member.user.username,
            fromRoleId: member.roleId,
            fromRoleName: member.role?.name ?? null,
            toRoleId: role.id,
            toRoleName: role.name,
        },
        userId
    );

    notifyRoleChanged({ team, member: updated }).catch((err) =>
        console.error("[team] role-changed email failed:", err?.message)
    );

    return updated;
};

// Sets which Points of Sale a member can act on - orthogonal to their role
// (changeMemberRole above changes WHAT they can do, this changes WHERE).
// The owner is never affected by this: they're always full-scope, same as
// they're always "admin" on every module regardless of TeamRolePermission
// (see team.permissions.js#getModuleAccessLevel and its "rule 4" comment).
export const changeMemberScope = async ({ team, actorId, userId, scopeAll, pointOfSaleIds }) => {
    if (userId === team.ownerId) {
        throw new ApiError(400, "El alcance del owner no se puede cambiar: siempre tiene acceso a todos los puntos de venta.");
    }

    const member = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId, status: "active" },
        include: { user: { select: { username: true } } },
    });
    if (!member) {
        throw new ApiError(404, "Miembro activo no encontrado");
    }

    if (scopeAll) {
        const updated = await prisma.$transaction(async (tx) => {
            // No reason to keep stale grant rows around once they're
            // ignored - resolveAccountScope only reads them when
            // scopeAll is false anyway, but leaving them would silently
            // resurface if scope were narrowed again without an explicit
            // new list.
            await tx.teamMemberPointOfSale.deleteMany({ where: { teamMemberId: member.id } });
            return tx.teamMember.update({ where: { id: member.id }, data: { scopeAll: true } });
        });

        await logActivity(
            team.id,
            actorId,
            "member.scope_changed",
            { targetUsername: member.user.username, scopeAll: true },
            userId
        );
        // This member's already-connected sockets joined a fixed room list
        // at connect time - force a reconnect so it's recomputed against
        // their new scope (see utils/posScopeStore.js).
        publishPosScopeChange({ accountId: team.ownerId, userId }).catch(() => {});
        return { ...updated, pointsOfSale: [] };
    }

    const ids = [...new Set(Array.isArray(pointOfSaleIds) ? pointOfSaleIds : [])];
    if (ids.length === 0) {
        throw new ApiError(400, "Selecciona al menos un punto de venta, o usa scopeAll: true para acceso a todos.");
    }

    const validCount = await prisma.pointOfSale.count({
        where: { id: { in: ids }, accountId: team.ownerId },
    });
    if (validCount !== ids.length) {
        throw new ApiError(400, "Uno o más puntos de venta no pertenecen a esta cuenta.");
    }

    await prisma.$transaction(async (tx) => {
        await tx.teamMember.update({ where: { id: member.id }, data: { scopeAll: false } });
        await tx.teamMemberPointOfSale.deleteMany({ where: { teamMemberId: member.id } });
        await tx.teamMemberPointOfSale.createMany({
            data: ids.map((pointOfSaleId) => ({ teamMemberId: member.id, pointOfSaleId })),
        });
    });

    const pointsOfSale = await prisma.pointOfSale.findMany({ where: { id: { in: ids } } });

    await logActivity(
        team.id,
        actorId,
        "member.scope_changed",
        { targetUsername: member.user.username, scopeAll: false, pointOfSaleIds: ids },
        userId
    );
    publishPosScopeChange({ accountId: team.ownerId, userId }).catch(() => {});

    return { ...member, scopeAll: false, pointsOfSale };
};

export const removeMember = async ({ team, actorId, userId }) => {
    if (userId === team.ownerId) {
        throw new ApiError(400, "El owner no se puede remover. Transfiere la propiedad del equipo primero.");
    }

    const member = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId, status: "active" },
        include: {
            user: { select: { username: true, email: true, preferredLanguage: true } },
            role: { select: { name: true } },
        },
    });
    if (!member) {
        throw new ApiError(404, "Miembro activo no encontrado");
    }

    await prisma.teamMember.update({
        where: { id: member.id },
        data: { status: "removed", removedAt: new Date() },
    });

    // Force them off immediately rather than waiting for their token to
    // expire naturally - resources they touched stay with the owner's
    // account automatically (see the Team model comment), nothing to
    // reassign.
    await revokeAllSessions(userId);

    await logActivity(
        team.id,
        actorId,
        "member.removed",
        { targetUsername: member.user.username, roleName: member.role?.name ?? null },
        userId
    );

    notifyMemberRemoved({ team, removedUser: member.user }).catch((err) =>
        console.error("[team] removed-member email failed:", err?.message)
    );

    return { removed: true };
};

// ─── Sessions (owner managing a member's devices) ──────────────────────────
// Lets a team owner see/end a member's active sessions without removing them
// from the team entirely (removeMember above already force-ends every
// session, but that's a much bigger, harder-to-undo action). Scoped to
// "active member of THIS team" the same way removeMember is - an owner can
// only reach sessions for people actually on their own team, never an
// arbitrary userId. The owner's own sessions aren't reachable here (they're
// not a TeamMember row) - that's what the self-service /users/sessions panel
// is for.

const requireActiveMember = async (team, userId) => {
    const member = await prisma.teamMember.findFirst({ where: { teamId: team.id, userId, status: "active" } });
    if (!member) {
        throw new ApiError(404, "Miembro activo no encontrado");
    }
};

export const getMemberSessions = async ({ team, userId }) => {
    await requireActiveMember(team, userId);
    return listSessions(userId);
};

export const revokeMemberSession = async ({ team, userId, sessionId }) => {
    await requireActiveMember(team, userId);
    const revoked = await revokeSession(userId, sessionId);
    if (!revoked) {
        throw new ApiError(404, "Sesión no encontrada");
    }
};

// ─── Activity log ───────────────────────────────────────────────────────

export const listActivity = async (team, { limit = 50 } = {}) => {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const logs = await prisma.teamActivityLog.findMany({
        where: { teamId: team.id },
        orderBy: { createdAt: "desc" },
        take,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))];
    const actors = actorIds.length
        ? await prisma.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, username: true, email: true },
          })
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return logs.map((log) => ({
        ...log,
        actor: log.actorId ? actorMap.get(log.actorId) ?? null : null,
    }));
};
