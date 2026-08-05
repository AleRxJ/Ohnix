import { api } from "../api/api";

export const apiKeyService = {
    async listApiKeys() {
        const response = await api.get("/api-keys");
        return response.data;
    },

    async createApiKey(name) {
        const response = await api.post("/api-keys", { name });
        return response.data;
    },

    async revokeApiKey(id) {
        const response = await api.delete(`/api-keys/${id}`);
        return response.data;
    },
};
