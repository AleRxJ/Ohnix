import { api } from "../api/api";

export const apiKeyService = {
    async listApiKeys() {
        const response = await api.get("/api-keys");
        return response.data;
    },

    async getAvailableScopes() {
        const response = await api.get("/api-keys/scopes");
        return response.data;
    },

    async createApiKey(name, scopes) {
        const response = await api.post("/api-keys", { name, ...(scopes !== undefined && { scopes }) });
        return response.data;
    },

    async updateApiKeyScopes(id, scopes) {
        const response = await api.patch(`/api-keys/${id}/scopes`, { scopes });
        return response.data;
    },

    async revokeApiKey(id) {
        const response = await api.delete(`/api-keys/${id}`);
        return response.data;
    },
};
