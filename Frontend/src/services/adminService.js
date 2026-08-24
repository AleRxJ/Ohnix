import { api } from "../api/api";

export const adminService = {
    async listCompanies() {
        const response = await api.get("/companies/admin");
        return response.data;
    },

    async createCompany(payload) {
        const response = await api.post("/companies/admin", payload);
        return response.data;
    },

    async updateCompany(companyId, payload) {
        const response = await api.patch(`/companies/admin/${companyId}`, payload);
        return response.data;
    },

    async updateCompanyLogo(companyId, file) {
        const formData = new FormData();
        formData.append("logo", file);
        const response = await api.patch(`/companies/admin/${companyId}/logo`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data;
    },

    async registerCompanyWithAlanube(companyId) {
        const response = await api.post(`/companies/admin/${companyId}/alanube/register`);
        return response.data;
    },

    async registerCompanyWithItcycle(companyId, payload) {
        const response = await api.post(`/companies/admin/${companyId}/itcycle/register`, payload);
        return response.data;
    },

    async addItcycleNumberingResolution(companyId, payload) {
        const response = await api.post(`/companies/admin/${companyId}/itcycle/numbering-resolutions`, payload);
        return response.data;
    },

    async setCompanyFirmaPassLoginKey(companyId, loginKey) {
        const response = await api.put(`/companies/admin/${companyId}/itcycle/firmapass/login-key`, { loginKey });
        return response.data;
    },

    async uploadCompanyFirmaPassRut(companyId, validationUuid, payload) {
        const response = await api.post(
            `/companies/admin/${companyId}/itcycle/firmapass/validations/${validationUuid}/rut`,
            payload
        );
        return response.data;
    },

    async uploadCompanyFirmaPassArchivo(companyId, validationUuid, payload) {
        const response = await api.post(
            `/companies/admin/${companyId}/itcycle/firmapass/validations/${validationUuid}/archivos`,
            payload
        );
        return response.data;
    },

    async confirmCompanyFirmaPassValidation(companyId, validationUuid) {
        const response = await api.post(
            `/companies/admin/${companyId}/itcycle/firmapass/validations/${validationUuid}/confirmar`
        );
        return response.data;
    },

    async getCompanyFirmaPassStatus(companyId) {
        const response = await api.get(`/companies/admin/${companyId}/itcycle/firmapass/status`);
        return response.data;
    },

    async listUsers() {
        const response = await api.get("/users/admin/users");
        return response.data;
    },

    async createUser(payload) {
        const response = await api.post("/users/admin/users", payload);
        return response.data;
    },

    async updateUser(userId, payload) {
        const response = await api.patch(`/users/admin/users/${userId}`, payload);
        return response.data;
    },

    // Colombia VAT config (general rate, ET art. 437 UVT threshold, DIAN's
    // yearly UVT peso value) - see Backend/utils/systemSettings.js. These
    // change by government decree, not by a code deploy, so an admin edits
    // them here instead of a constant in the codebase.
    async getColombiaTaxSettings() {
        const response = await api.get("/system-settings/colombia-tax");
        return response.data;
    },

    async updateColombiaTaxSettings(payload) {
        const response = await api.patch("/system-settings/colombia-tax", payload);
        return response.data;
    },
};
