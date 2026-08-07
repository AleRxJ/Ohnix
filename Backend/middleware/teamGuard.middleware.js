import { ApiError } from "../utils/ApiError.js";

// Billing, API keys and other account-wide sensitive actions are NOT part of
// the per-module permission system (team.permissions.js) - they are always
// owner-only in v1, regardless of what a team member's role grants elsewhere.
// Without this, resolveAccountScope's createdById remapping (auth.middleware.js)
// would let any team member with, say, "reports: view" also cancel the whole
// team's subscription, since req.user.prismaId already resolves to the owner
// for billing lookups too.
export const blockTeamMembers = (req, _res, next) => {
    if (req.user?.isTeamMember) {
        return next(
            new ApiError(
                403,
                "Esta acción solo está disponible para el owner del equipo."
            )
        );
    }
    return next();
};
