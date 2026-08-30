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

    // itcycle-provider invoices never get a stored pdfUrl (itcycle-api-dian
    // keeps the signed XML internally, no public URLs - see
    // mapItcycleResponse in electronicInvoicing.service.js) - this generates
    // the DIAN "representación gráfica" on demand instead. Same
    // blob-download pattern as useOrderOperations.js's generateInvoice
    // (cookie auth via axios, not a plain <a href>, since the backend route
    // requires the session cookie a bare anchor navigation wouldn't send
    // cross-origin the same way).
    async downloadPdf(orderId, invoiceNumber) {
        const response = await api.get(`/orders/${orderId}/electronic-invoice/pdf`, { responseType: "blob" });
        const blob = new Blob([response.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `factura-electronica-${invoiceNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },
};
