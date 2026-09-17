import { api } from "../api/api";

export const integrationService = {
    async list() {
        const response = await api.get("/integrations");
        return response.data;
    },

    async create({ provider, name, config, credentials }) {
        const response = await api.post("/integrations", { provider, name, config, credentials });
        return response.data;
    },

    async test(id) {
        const response = await api.post(`/integrations/${id}/test`);
        return response.data;
    },

    async remove(id) {
        const response = await api.delete(`/integrations/${id}`);
        return response.data;
    },

    async getLogs(id) {
        const response = await api.get(`/integrations/${id}/logs`);
        return response.data;
    },

    async publishProduct(id, productId) {
        const response = await api.post(`/integrations/${id}/products/${productId}/publish`);
        return response.data;
    },

    async syncInventory(id, { productId, variantId }) {
        const response = await api.post(`/integrations/${id}/inventory/sync`, { product_id: productId, variant_id: variantId });
        return response.data;
    },
};
