import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { AUTH_COOKIE_OPTIONS } from "../utils/authTokens.js";
import * as teamService from "../services/team.service.js";

// ─── Route-level guards (loadTeam + requireTeamOwnerActor) ────────────────
// Applied by team.routes.js before these handlers run. actorId (the real
// logged-in user, never remapped to the account owner - see
// auth.middleware.js) is what "is this literally the owner" checks against;
// prismaId is the resource-scope id and is NOT the right field to compare
// here, since it already equals the owner's id for every team member too.

export const loadTeam = asyncHandler(async (req, _res, next) => {
    const { id } = req.params;
    req.team = await teamService.getTeamById(id);
    next();
});

export const requireTeamOwnerActor = asyncHandler(async (req, _res, next) => {
    if (!req.team) {
        return next(new ApiError(500, "requireTeamOwnerActor used without loadTeam"));
    }
    if (req.team.ownerId !== req.user.actorId) {
        return next(new ApiError(403, "Solo el owner del equipo puede hacer esto."));
    }
    next();
});

// Members can view (list, roles, etc) if they belong to this exact team, or
// if they're the owner. Actual module-level view permission is layered on
// top by requireModulePermission("team", "view") in the routes.
export const requireTeamAccess = asyncHandler(async (req, _res, next) => {
    if (!req.team) {
        return next(new ApiError(500, "requireTeamAccess used without loadTeam"));
    }
    const isOwner = req.team.ownerId === req.user.actorId;
    const isMemberOfThisTeam = req.user.isTeamMember && req.user.teamId === req.team.id;
    if (!isOwner && !isMemberOfThisTeam) {
        return next(new ApiError(403, "No perteneces a este equipo."));
    }
    next();
});

// ─── Team ─────────────────────────────────────────────────────────────────

export const createTeam = asyncHandler(async (req, res) => {
    const team = await teamService.createTeam({
        ownerId: req.user.actorId,
        name: req.body?.name,
    });
    return res.status(201).json(new ApiResponse(201, team, "Team created successfully"));
});

// Lets both an owner and a member resolve "my team" without knowing its id
// up front - used by the frontend on load to bootstrap the team UI.
export const getCurrentTeam = asyncHandler(async (req, res) => {
    const team = await teamService.resolveRequestTeam(req.user);
    const isOwner = team.ownerId === req.user.actorId;

    let myRole = null;
    // Owner contact info - so a member without billing access can be told
    // who to ask ("habla con tu administrador") instead of hitting a dead-end
    // CTA. Same "no special grant needed" rule as the rest of this endpoint:
    // knowing who your team's admin is isn't a permission-gated fact.
    let ownerContact = null;
    if (!isOwner) {
        const [membership, owner] = await Promise.all([
            prisma.teamMember.findFirst({
                where: { teamId: team.id, userId: req.user.actorId, status: "active" },
                include: { role: { include: { permissions: true } } },
            }),
            prisma.user.findUnique({
                where: { id: team.ownerId },
                select: { username: true, email: true },
            }),
        ]);
        myRole = membership?.role ?? null;
        ownerContact = owner ? { name: owner.username, email: owner.email } : null;
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { team: { ...team, ownerName: ownerContact?.name ?? null, ownerEmail: ownerContact?.email ?? null }, isOwner, myRole },
            "Current team fetched successfully"
        )
    );
});

export const getTeam = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, req.team, "Team fetched successfully"));
});

export const updateTeam = asyncHandler(async (req, res, next) => {
    const { name, newOwnerUserId } = req.body || {};

    if (!name && !newOwnerUserId) {
        return next(new ApiError(400, "Proporciona un nombre para renombrar el equipo, o newOwnerUserId para transferir la propiedad"));
    }

    let team = req.team;
    if (name) {
        team = await teamService.renameTeam({ team, actorId: req.user.actorId, name });
    }
    if (newOwnerUserId) {
        team = await teamService.transferOwnership({ team, actorId: req.user.actorId, newOwnerUserId });
    }

    return res.status(200).json(new ApiResponse(200, team, "Team updated successfully"));
});

// ─── Roles ────────────────────────────────────────────────────────────────

export const listRoles = asyncHandler(async (req, res) => {
    const roles = await teamService.listRoles(req.team);
    return res.status(200).json(new ApiResponse(200, roles, "Roles fetched successfully"));
});

export const createRole = asyncHandler(async (req, res) => {
    const role = await teamService.createRole({
        team: req.team,
        actorId: req.user.actorId,
        name: req.body?.name,
        permissions: req.body?.permissions,
    });
    return res.status(201).json(new ApiResponse(201, role, "Role created successfully"));
});

export const updateRole = asyncHandler(async (req, res) => {
    const role = await teamService.updateRole({
        team: req.team,
        actorId: req.user.actorId,
        roleId: req.params.roleId,
        name: req.body?.name,
        permissions: req.body?.permissions,
    });
    return res.status(200).json(new ApiResponse(200, role, "Role updated successfully"));
});

export const deleteRole = asyncHandler(async (req, res) => {
    await teamService.deleteRole({
        team: req.team,
        actorId: req.user.actorId,
        roleId: req.params.roleId,
    });
    return res.status(200).json(new ApiResponse(200, {}, "Role deleted successfully"));
});

// ─── Invitations ────────────────────────────────────────────────────────

export const createInvitation = asyncHandler(async (req, res) => {
    const invitation = await teamService.createInvitation({
        team: req.team,
        actorId: req.user.actorId,
        email: req.body?.email,
        roleId: req.body?.roleId,
    });
    return res.status(201).json(new ApiResponse(201, invitation, "Invitation sent successfully"));
});

export const listInvitations = asyncHandler(async (req, res) => {
    const invitations = await teamService.listInvitations(req.team);
    return res.status(200).json(new ApiResponse(200, invitations, "Invitations fetched successfully"));
});

export const resendInvitation = asyncHandler(async (req, res) => {
    const invitation = await teamService.resendInvitation({
        team: req.team,
        actorId: req.user.actorId,
        invitationId: req.params.invId,
    });
    return res.status(200).json(new ApiResponse(200, invitation, "Invitation resent successfully"));
});

export const revokeInvitation = asyncHandler(async (req, res) => {
    const invitation = await teamService.revokeInvitation({
        team: req.team,
        actorId: req.user.actorId,
        invitationId: req.params.invId,
    });
    return res.status(200).json(new ApiResponse(200, invitation, "Invitation revoked successfully"));
});

// Public, read-only - no verifyJWT.
export const previewInvitation = asyncHandler(async (req, res) => {
    const preview = await teamService.previewInvitation(req.params.token);
    return res.status(200).json(new ApiResponse(200, preview, "Invitation preview fetched successfully"));
});

// Public - no verifyJWT. The token itself is the credential.
export const acceptInvitation = asyncHandler(async (req, res) => {
    const { username, password, preferredLanguage, deviceId, deviceClass } = req.body || {};

    const { user, team, role, tokens } = await teamService.acceptInvitation({
        token: req.params.token,
        username,
        password,
        preferredLanguage: preferredLanguage || req.headers["accept-language"],
        deviceId,
        deviceClass,
        deviceInfo: req.header("User-Agent"),
    });

    return res
        .status(201)
        .cookie("accessToken", tokens.accessToken, AUTH_COOKIE_OPTIONS.access)
        .cookie("refreshToken", tokens.refreshToken, AUTH_COOKIE_OPTIONS.refresh)
        .json(
            new ApiResponse(
                201,
                {
                    user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar },
                    team: { id: team.id, name: team.name },
                    role: { id: role.id, name: role.name },
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                },
                "Invitation accepted - welcome to the team!"
            )
        );
});

// ─── Members ──────────────────────────────────────────────────────────────

export const listMembers = asyncHandler(async (req, res) => {
    const members = await teamService.listMembers(req.team);
    return res.status(200).json(new ApiResponse(200, members, "Members fetched successfully"));
});

export const updateMember = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { roleId, status, scopeAll, pointOfSaleIds } = req.body || {};

    if (status === "removed") {
        await teamService.removeMember({ team: req.team, actorId: req.user.actorId, userId });
        return res.status(200).json(new ApiResponse(200, { removed: true }, "Member removed successfully"));
    }

    if (roleId) {
        const member = await teamService.changeMemberRole({
            team: req.team,
            actorId: req.user.actorId,
            userId,
            roleId,
        });
        return res.status(200).json(new ApiResponse(200, member, "Member role updated successfully"));
    }

    if (scopeAll !== undefined || pointOfSaleIds !== undefined) {
        const member = await teamService.changeMemberScope({
            team: req.team,
            actorId: req.user.actorId,
            userId,
            scopeAll: Boolean(scopeAll),
            pointOfSaleIds,
        });
        return res.status(200).json(new ApiResponse(200, member, "Member scope updated successfully"));
    }

    return next(new ApiError(400, "Proporciona roleId para cambiar el rol, scopeAll/pointOfSaleIds para el alcance, o status: \"removed\" para remover al miembro"));
});

export const listTeamSessions = asyncHandler(async (req, res) => {
    const sessions = await teamService.listTeamSessions(req.team);
    return res.status(200).json(
        new ApiResponse(
            200,
            sessions.map((session) => ({
                id: session.id,
                deviceClass: session.deviceClass,
                deviceLabel: session.deviceLabel,
                lastSeenAt: session.lastSeenAt,
                createdAt: session.createdAt,
                user: session.user,
            })),
            "Sessions fetched successfully"
        )
    );
});

export const listMemberSessions = asyncHandler(async (req, res) => {
    const sessions = await teamService.getMemberSessions({ team: req.team, userId: req.params.userId });
    return res.status(200).json(
        new ApiResponse(
            200,
            sessions.map((session) => ({
                id: session.id,
                deviceClass: session.deviceClass,
                deviceLabel: session.deviceLabel,
                lastSeenAt: session.lastSeenAt,
                createdAt: session.createdAt,
            })),
            "Sessions fetched successfully"
        )
    );
});

export const revokeMemberSession = asyncHandler(async (req, res) => {
    await teamService.revokeMemberSession({
        team: req.team,
        userId: req.params.userId,
        sessionId: req.params.sessionId,
    });
    return res.status(200).json(new ApiResponse(200, {}, "Session revoked successfully"));
});

// ─── Activity ─────────────────────────────────────────────────────────────

export const listActivity = asyncHandler(async (req, res) => {
    const activity = await teamService.listActivity(req.team, { limit: req.query?.limit });
    return res.status(200).json(new ApiResponse(200, activity, "Team activity fetched successfully"));
});
