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

    async addMyItcycleNumberingResolution(payload) {
        const response = await api.post("/company/me/itcycle/numbering-resolutions", payload);
        return response.data;
    },

    async activateMyItcycleElectronicInvoicing(idempotencyKey) {
        const response = await api.post("/company/me/itcycle/activate", undefined, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async setMyFirmaPassLoginKey(loginKey) {
        const response = await api.put("/company/me/itcycle/firmapass/login-key", { loginKey });
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
