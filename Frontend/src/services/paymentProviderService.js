import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/paymentProvider.routes.js - the company's OWN
// payment provider account (Bold today) for charging from the Caja.
export const paymentProviderService = {
    async getConnection(provider = "bold") {
        const response = await api.get(`/payment-providers/${provider}/connection`);
        return response.data?.data || null;
    },

    async saveConnection(payload, provider = "bold") {
        const response = await api.put(`/payment-providers/${provider}/connection`, payload);
        return response.data?.data;
    },

    async disconnect(provider = "bold") {
        const response = await api.delete(`/payment-providers/${provider}/connection`);
        return response.data?.data;
    },

    async listTerminals(provider = "bold") {
        const response = await api.get(`/payment-providers/${provider}/terminals`);
        return response.data?.data || [];
    },

    async createIntent(payload, provider = "bold") {
        const response = await api.post(`/payment-providers/${provider}/intents`, payload, idempotencyHeaders());
        return response.data?.data;
    },

    async getIntent(intentId) {
        const response = await api.get(`/payment-providers/intents/${intentId}`);
        return response.data?.data;
    },

    async cancelIntent(intentId) {
        const response = await api.post(`/payment-providers/intents/${intentId}/cancel`);
        return response.data?.data;
    },

    // "Pagos por verificar" (Backend finance.routes.js).
    async listVerifications(status = "pending") {
        const response = await api.get("/finance/payment-verifications", { params: { status } });
        return response.data?.data || { payments: [], pending_count: 0, intents_needing_review: [] };
    },

    async setVerification(paymentId, { status, note }) {
        const response = await api.patch(`/finance/order-payments/${paymentId}/verification`, { status, note });
        return response.data?.data;
    },
};
