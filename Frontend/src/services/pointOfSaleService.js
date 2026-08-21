import { api } from "../api/api";

// Mirrors Backend/routes/pointOfSale.routes.js one to one.
export const pointOfSaleService = {
    async list() {
        const response = await api.get("/points-of-sale");
        return response.data;
    },

    async create(name) {
        const response = await api.post("/points-of-sale", { name });
        return response.data;
    },

    async rename(id, name) {
        const response = await api.patch(`/points-of-sale/${id}`, { name });
        return response.data;
    },

    async deactivate(id) {
        const response = await api.patch(`/points-of-sale/${id}`, { isActive: false });
        return response.data;
    },

    // Mirrors Backend/routes/team.routes.js's member-scope branch of
    // PATCH /teams/:id/members/:userId (team.service.js#changeMemberScope).
    async setMemberScope(teamId, userId, { scopeAll, pointOfSaleIds }) {
        const response = await api.patch(`/teams/${teamId}/members/${userId}`, {
            scopeAll,
            pointOfSaleIds,
        });
        return response.data;
    },
};
