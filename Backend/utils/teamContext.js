import { prisma } from "../db/prisma.js";

// Resolves which "account" a request should operate under.
//
// Ownership model (see the comment above `model Team` in schema.prisma):
// team members act on the team OWNER's account - every resource they create
// is written with createdById = owner.id, exactly like a solo user's own
// records, so every existing plan-limit check, uniqueness constraint and
// query keeps working unmodified. `accountId` below is that scope; `actorId`
// is always the real logged-in user, used for team-management authorship
// (invited_by, team_activity_logs.actor_id) and permission checks.
export const resolveAccountScope = async (userId) => {
    const [membership, ownedTeam] = await Promise.all([
        prisma.teamMember.findFirst({
            where: { userId, status: "active" },
            select: {
                teamId: true,
                roleId: true,
                team: { select: { ownerId: true } },
            },
        }),
        prisma.team.findUnique({
            where: { ownerId: userId },
            select: { id: true },
        }),
    ]);

    if (membership) {
        return {
            accountId: membership.team.ownerId,
            actorId: userId,
            teamId: membership.teamId,
            teamRoleId: membership.roleId,
            isTeamMember: true,
            isTeamOwner: false,
        };
    }

    return {
        accountId: userId,
        actorId: userId,
        teamId: ownedTeam?.id ?? null,
        teamRoleId: null,
        isTeamMember: false,
        isTeamOwner: Boolean(ownedTeam),
    };
};
