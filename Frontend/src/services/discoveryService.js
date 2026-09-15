import { api } from "../api/api";

export const discoveryService = {
    list: async ({ status, type } = {}) => {
        const response = await api.get("/discoveries", { params: { status, type } });
        return response.data.data;
    },
    get: async (id) => {
        const response = await api.get(`/discoveries/${id}`);
        return response.data.data;
    },
    updateStatus: async (id, status, reason) => {
        const response = await api.patch(`/discoveries/${id}/status`, { status, reason });
        return response.data.data;
    },
    setExplanation: async (id, explanation, tag) => {
        const response = await api.patch(`/discoveries/${id}/explanation`, { explanation, tag });
        return response.data.data;
    },
};
