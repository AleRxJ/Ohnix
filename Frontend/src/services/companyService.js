import { api } from "../api/api";

// Self-service counterpart to adminService.js's company calls - those hit
// /companies/admin/:id (Ohnix platform-admin only), this hits /company/me
// (the logged-in owner's own account, see Backend/routes/companySelf.routes.js).
export const companyService = {
    async getMyCompany() {
        const response = await api.get("/company/me");
        return response.data;
    },

    async updateMyCompany(payload) {
        const response = await api.patch("/company/me", payload);
        return response.data;
    },

    async updateMyCompanyLogo(file) {
        const formData = new FormData();
        formData.append("logo", file);
        const response = await api.patch("/company/me/logo", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data;
    },

    async deleteMyCompanyLogo() {
        const response = await api.delete("/company/me/logo");
        return response.data;
    },

    async getMyItcycleStatus() {
        const response = await api.get("/company/me/itcycle/status");
        return response.data;
    },

    async registerMyCompanyWithItcycle(payload, idempotencyKey) {
        const response = await api.post("/company/me/itcycle/register", payload, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async addMyItcycleNumberingResolution(payload, idempotencyKey) {
        const response = await api.post("/company/me/itcycle/numbering-resolutions", payload, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async activateMyItcycleElectronicInvoicing(idempotencyKey) {
        const response = await api.post("/company/me/itcycle/activate", undefined, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async resolveMyFirmaPassOrderNumber(orderNumber) {
        const response = await api.get(`/company/me/itcycle/firmapass/order/${encodeURIComponent(orderNumber)}`);
        return response.data;
    },

    // Drives the step-by-step self-service UI: FirmaPass's own
    // pending_documents/uploaded_documents on the validation say exactly
    // what's left to upload (each with its own real label/description), so
    // the wizard doesn't have to guess or show a generic "additional
    // document" field up front.
    async getMyFirmaPassValidation(validationUuid) {
        const response = await api.get(`/company/me/itcycle/firmapass/validations/${validationUuid}`);
        return response.data;
    },

    async uploadMyFirmaPassRut(validationUuid, payload) {
        const response = await api.post(`/company/me/itcycle/firmapass/validations/${validationUuid}/rut`, payload);
        return response.data;
    },

    async uploadMyFirmaPassArchivo(validationUuid, payload) {
        const response = await api.post(`/company/me/itcycle/firmapass/validations/${validationUuid}/archivos`, payload);
        return response.data;
    },

    async confirmMyFirmaPassValidation(validationUuid) {
        const response = await api.post(`/company/me/itcycle/firmapass/validations/${validationUuid}/confirmar`);
        return response.data;
    },

    async getMyFirmaPassStatus() {
        const response = await api.get("/company/me/itcycle/firmapass/status");
        return response.data;
    },
};
