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
//
// Points of Sale add a second, orthogonal scope on top of this: `accountId`
// says WHICH account's data a request touches (unchanged by any of this);
// posScopeAll/posScopeIds say WHICH of that account's locations the actor
// is allowed to touch. Same rule as module permissions (team.permissions.js
// #getModuleAccessLevel): the account owner is always full-scope and never
// consults TeamMemberPointOfSale, exactly like they're always "admin" on
// every module regardless of what TeamRolePermission says.
export const resolveAccountScope = async (userId) => {
    const [membership, ownedTeam] = await Promise.all([
        prisma.teamMember.findFirst({
            where: { userId, status: "active" },
            select: {
                id: true,
                teamId: true,
                roleId: true,
                scopeAll: true,
                team: { select: { ownerId: true } },
            },
        }),
        prisma.team.findUnique({
            where: { ownerId: userId },
            select: { id: true },
        }),
    ]);

    if (membership) {
        // Only fetch the explicit grant list when scope is actually
        // restricted - the common case (scopeAll: true, the default for
        // every member) needs no second query.
        const posScopeIds = membership.scopeAll
            ? null
            : (
                  await prisma.teamMemberPointOfSale.findMany({
                      where: { teamMemberId: membership.id },
                      select: { pointOfSaleId: true },
                  })
              ).map((row) => row.pointOfSaleId);

        return {
            accountId: membership.team.ownerId,
            actorId: userId,
            teamId: membership.teamId,
            teamRoleId: membership.roleId,
            isTeamMember: true,
            isTeamOwner: false,
            // null means "all locations" - mirrors PLAN_LIMITS' null =
            // "unlimited" convention (pricing.middleware.js) rather than an
            // empty array, which would instead mean "no locations at all".
            posScopeAll: membership.scopeAll,
            posScopeIds,
        };
    }

    return {
        accountId: userId,
        actorId: userId,
        teamId: ownedTeam?.id ?? null,
        teamRoleId: null,
        isTeamMember: false,
        isTeamOwner: Boolean(ownedTeam),
        posScopeAll: true,
        posScopeIds: null,
    };
};
