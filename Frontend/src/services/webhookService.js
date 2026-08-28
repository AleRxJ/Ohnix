import { api } from "../api/api";

export const webhookService = {
    async list() {
        const response = await api.get("/webhooks");
        return response.data;
    },

    async getAvailableEvents() {
        const response = await api.get("/webhooks/events");
        return response.data;
    },

    async create({ url, events }) {
        const response = await api.post("/webhooks", { url, events });
        return response.data;
    },

    async update(id, { url, events, is_active }) {
        const response = await api.patch(`/webhooks/${id}`, { url, events, is_active });
        return response.data;
    },

    async remove(id) {
        const response = await api.delete(`/webhooks/${id}`);
        return response.data;
    },

    async getDeliveries(id) {
        const response = await api.get(`/webhooks/${id}/deliveries`);
        return response.data;
    },
};
