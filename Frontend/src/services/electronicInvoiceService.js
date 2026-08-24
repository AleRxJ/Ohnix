import { api } from "../api/api";

export const electronicInvoiceService = {
    async list(params = {}) {
        const response = await api.get("/electronic-invoices", { params });
        return response.data;
    },

    async getForOrder(orderId) {
        const response = await api.get(`/orders/${orderId}/electronic-invoice`);
        return response.data;
    },

    async issue(orderId) {
        const response = await api.post(`/orders/${orderId}/electronic-invoice/issue`);
        return response.data;
    },

    async retry(orderId) {
        return this.issue(orderId);
    },

    async sync(orderId) {
        const response = await api.post(`/orders/${orderId}/electronic-invoice/sync`);
        return response.data;
    },

    async listCreditNotes(orderId) {
        const response = await api.get(`/orders/${orderId}/electronic-invoice/credit-notes`);
        return response.data;
    },

    async createCreditNote(orderId, { conceptCode, observation, items, amount, taxRate }) {
        const response = await api.post(`/orders/${orderId}/electronic-invoice/credit-notes`, {
            concept_code: conceptCode,
            observation,
            items,
            amount,
            tax_rate: taxRate,
        });
        return response.data;
    },
};
