import { api } from "../api/api";
import { getOrCreateDeviceId } from "../utils/deviceId.js";
import { getClientPlatform } from "../utils/platform.js";

// Mirrors Backend/routes/team.routes.js one to one.
export const teamService = {
    async createTeam(name) {
        const response = await api.post("/teams", { name });
        return response.data;
    },

    async getCurrentTeam() {
        const response = await api.get("/teams/current");
        return response.data;
    },

    async getPermissionCatalog() {
        const response = await api.get("/teams/permission-catalog");
        return response.data;
    },

    async updateTeam(teamId, payload) {
        const response = await api.patch(`/teams/${teamId}`, payload);
        return response.data;
    },

    async getMembers(teamId) {
        const response = await api.get(`/teams/${teamId}/members`);
        return response.data;
    },

    async changeMemberRole(teamId, userId, roleId) {
        const response = await api.patch(`/teams/${teamId}/members/${userId}`, { roleId });
        return response.data;
    },

    async removeMember(teamId, userId) {
        const response = await api.patch(`/teams/${teamId}/members/${userId}`, { status: "removed" });
        return response.data;
    },

    async getTeamSessions(teamId) {
        const response = await api.get(`/teams/${teamId}/sessions`);
        return response.data;
    },

    async getMemberSessions(teamId, userId) {
        const response = await api.get(`/teams/${teamId}/members/${userId}/sessions`);
        return response.data;
    },

    async revokeMemberSession(teamId, userId, sessionId) {
        const response = await api.delete(`/teams/${teamId}/members/${userId}/sessions/${sessionId}`);
        return response.data;
    },

    async getInvitations(teamId) {
        const response = await api.get(`/teams/${teamId}/invitations`);
        return response.data;
    },

    async createInvitation(teamId, { email, roleId }) {
        const response = await api.post(`/teams/${teamId}/invitations`, { email, roleId });
        return response.data;
    },

    async resendInvitation(teamId, invitationId) {
        const response = await api.post(`/teams/${teamId}/invitations/${invitationId}/resend`);
        return response.data;
    },

    async revokeInvitation(teamId, invitationId) {
        const response = await api.delete(`/teams/${teamId}/invitations/${invitationId}`);
        return response.data;
    },

    async getRoles(teamId) {
        const response = await api.get(`/teams/${teamId}/roles`);
        return response.data;
    },

    async createRole(teamId, { name, permissions }) {
        const response = await api.post(`/teams/${teamId}/roles`, { name, permissions });
        return response.data;
    },

    async updateRole(teamId, roleId, { name, permissions }) {
        const response = await api.patch(`/teams/${teamId}/roles/${roleId}`, { name, permissions });
        return response.data;
    },

    async deleteRole(teamId, roleId) {
        const response = await api.delete(`/teams/${teamId}/roles/${roleId}`);
        return response.data;
    },

    async getActivity(teamId, limit = 50) {
        const response = await api.get(`/teams/${teamId}/activity?limit=${limit}`);
        return response.data;
    },

    // Public - no auth required.
    async previewInvitation(token) {
        const response = await api.get(`/invitations/${token}`);
        return response.data;
    },

    // Public - no auth required, the token itself is the credential.
    async acceptInvitation(token, { username, password, preferredLanguage }) {
        const response = await api.post(`/invitations/${token}/accept`, {
            username,
            password,
            preferredLanguage,
            deviceId: getOrCreateDeviceId(),
            deviceClass: getClientPlatform(),
        });
        return response.data;
    },
};
