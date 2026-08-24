import { api } from "../api/api";

// Purchase-side mirror of electronicInvoiceService.js, for Documento Soporte
// (DIAN type "05", itcycle-api-dian only) - no credit-note equivalent exists
// for this document type, so those methods have no counterpart here.
export const purchaseSupportDocumentService = {
    async list(params = {}) {
        const response = await api.get("/purchase-support-documents", { params });
        return response.data;
    },

    async getForPurchase(purchaseId) {
        const response = await api.get(`/purchases/${purchaseId}/support-document`);
        return response.data;
    },

    async issue(purchaseId) {
        const response = await api.post(`/purchases/${purchaseId}/support-document/issue`);
        return response.data;
    },

    async retry(purchaseId) {
        return this.issue(purchaseId);
    },

    async sync(purchaseId) {
        const response = await api.post(`/purchases/${purchaseId}/support-document/sync`);
        return response.data;
    },
};
