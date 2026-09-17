import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { logAdminAction } from "../utils/adminAudit.js";
import * as adminTeamService from "../services/adminTeam.service.js";

export const getUserTeamContextAdmin = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const context = await adminTeamService.getTeamContextForUser(userId);
    return res.status(200).json(new ApiResponse(200, context, "Team context fetched successfully"));
});

export const updateUserTeamMemberAdmin = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { roleId, status, scopeAll, pointOfSaleIds } = req.body || {};

    const result = await adminTeamService.updateTeamMemberAdmin({
        targetUserId: userId,
        adminId: req.user.prismaId,
        roleId,
        status,
        scopeAll,
        pointOfSaleIds,
    });

    const action =
        status === "removed"
            ? "team.member_removed"
            : roleId
            ? "team.member_role_changed"
            : "team.member_scope_changed";

    await logAdminAction({
        adminId: req.user.prismaId,
        action,
        targetType: "team_member",
        targetId: userId,
        targetUserId: userId,
        metadata: { roleId, status, scopeAll, pointOfSaleIds },
    });

    return res.status(200).json(new ApiResponse(200, result, "Team member updated successfully"));
});
