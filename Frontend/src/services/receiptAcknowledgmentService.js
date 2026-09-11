import { api } from "../api/api";

// Purchase-side mirror of purchaseSupportDocumentService.js, for RADIAN
// buyer-side acknowledgment events (acuse de recibo / recibo del bien /
// aceptación expresa / reclamo) - opposite supplier precondition
// (issuesElectronicInvoice, not notObligatedToInvoice). PHASE 1: itcycle-api-dian
// only accepts these in DIAN_SIMULATION_MODE - see that repo's
// receiptAcknowledgment.service.ts. No "recepcion" method - it auto-fires
// chained after acuse, never as its own manual action.
export const receiptAcknowledgmentService = {
    async list(params = {}) {
        const response = await api.get("/received-invoice-receipts", { params });
        return response.data;
    },

    async getForPurchase(purchaseId) {
        const response = await api.get(`/purchases/${purchaseId}/receipt-acknowledgment`);
        return response.data;
    },

    async recordReference(purchaseId, { supplierInvoiceNumber, supplierCufe, supplierIssuedAt }) {
        const response = await api.post(`/purchases/${purchaseId}/receipt-acknowledgment/reference`, {
            supplier_invoice_number: supplierInvoiceNumber,
            supplier_cufe: supplierCufe,
            supplier_issued_at: supplierIssuedAt,
        });
        return response.data;
    },

    async triggerAcuse(purchaseId) {
        const response = await api.post(`/purchases/${purchaseId}/receipt-acknowledgment/acuse`);
        return response.data;
    },

    async triggerAceptacionExpresa(purchaseId) {
        const response = await api.post(`/purchases/${purchaseId}/receipt-acknowledgment/aceptacion-expresa`);
        return response.data;
    },

    async triggerReclamo(purchaseId, reason) {
        const response = await api.post(`/purchases/${purchaseId}/receipt-acknowledgment/reclamo`, { reason });
        return response.data;
    },

    async sync(purchaseId, eventType) {
        const response = await api.post(`/purchases/${purchaseId}/receipt-acknowledgment/sync`, { eventType });
        return response.data;
    },
};
