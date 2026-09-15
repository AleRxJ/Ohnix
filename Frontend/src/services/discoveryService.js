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
    // Admin-only - see Backend/controllers/discoveryDimensionConfig.controller.js.
    // Lets an operator turn a registered-but-dormant search dimension on (or
    // a default-on one off) for a config-driven detector without a deploy.
    listDimensionConfig: async (detectorKey) => {
        const response = await api.get("/discovery-dimension-config", { params: { detectorKey } });
        return response.data.data;
    },
    setDimensionConfig: async ({ detectorKey, dimensionKey, enabled }) => {
        const response = await api.patch("/discovery-dimension-config", { detectorKey, dimensionKey, enabled });
        return response.data.data;
    },
};
