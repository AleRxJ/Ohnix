import { api } from "../api/api";

// Cross-tenant counterpart to teamService.js - used only by the platform
// admin panel (adminService.js's sibling), which looks up ANY user's team,
// not the caller's own.
export const adminTeamService = {
    async getTeamContext(userId) {
        const response = await api.get(`/users/admin/users/${userId}/team`);
        return response.data;
    },

    async changeMemberRole(userId, roleId) {
        const response = await api.patch(`/users/admin/users/${userId}/team/member`, { roleId });
        return response.data;
    },

    async changeMemberScope(userId, { scopeAll, pointOfSaleIds }) {
        const response = await api.patch(`/users/admin/users/${userId}/team/member`, {
            scopeAll,
            pointOfSaleIds,
        });
        return response.data;
    },

    async removeMember(userId) {
        const response = await api.patch(`/users/admin/users/${userId}/team/member`, {
            status: "removed",
        });
        return response.data;
    },
};
