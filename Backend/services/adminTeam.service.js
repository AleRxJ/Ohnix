import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { resolveAccountScope } from "../utils/teamContext.js";
import * as teamService from "./team.service.js";

// Cross-tenant counterpart to the tenant-scoped team.service.js functions -
// used only by the platform admin panel (routes gated by isAdmin), where the
// caller is looking up ANY user's team, not their own. Resolves the team via
// resolveAccountScope (works for both an owner and a member) instead of the
// req.user-shaped resolveRequestTeam, then delegates every read/write to the
// existing team.service.js functions unchanged - including their built-in
// owner protections - so this file adds no new business rules of its own.
export const getTeamContextForUser = async (targetUserId) => {
    const scope = await resolveAccountScope(targetUserId);
    if (!scope?.teamId) {
        return { hasTeam: false };
    }

    const team = await teamService.getTeamById(scope.teamId);
    const [members, roles, pointsOfSale] = await Promise.all([
        teamService.listMembers(team),
        teamService.listRoles(team),
        prisma.pointOfSale.findMany({
            where: { accountId: team.ownerId },
            orderBy: { name: "asc" },
        }),
    ]);

    return {
        hasTeam: true,
        team,
        isOwner: Boolean(scope.isTeamOwner),
        members,
        roles,
        pointsOfSale,
    };
};

export const updateTeamMemberAdmin = async ({
    targetUserId,
    adminId,
    roleId,
    status,
    scopeAll,
    pointOfSaleIds,
}) => {
    const scope = await resolveAccountScope(targetUserId);
    if (!scope?.teamId) {
        throw new ApiError(404, "This user does not belong to a team.");
    }

    const team = await teamService.getTeamById(scope.teamId);

    if (status === "removed") {
        return teamService.removeMember({ team, actorId: adminId, userId: targetUserId });
    }

    if (roleId) {
        return teamService.changeMemberRole({ team, actorId: adminId, userId: targetUserId, roleId });
    }

    if (scopeAll !== undefined || pointOfSaleIds !== undefined) {
        return teamService.changeMemberScope({
            team,
            actorId: adminId,
            userId: targetUserId,
            scopeAll: Boolean(scopeAll),
            pointOfSaleIds,
        });
    }

    throw new ApiError(
        400,
        'Provide roleId to change the role, scopeAll/pointOfSaleIds to change scope, or status: "removed" to remove the member.'
    );
};
