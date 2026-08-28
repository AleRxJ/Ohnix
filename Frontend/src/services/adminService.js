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

    // itcycle-api-dian registration/numbering/FirmaPass rut/archivos/confirmar
    // steps are self-service now (see Frontend/src/services/companyService.js's
    // /company/me/itcycle/* calls) - this stays for Ohnix admin support
    // visibility only.
    async getCompanyFirmaPassStatus(companyId) {
        const response = await api.get(`/companies/admin/${companyId}/itcycle/firmapass/status`);
        return response.data;
    },

    // Alliance-wide (not scoped to a company) - see
    // Backend/services/firmaPassProvisioning.service.js. A client's
    // certificate purchase (made on FirmaPass's own site with iTCycle's
    // coupon) auto-attaches to iTCycle's own FirmaPass account; these let an
    // admin browse that queue and match a validation to an Ohnix company by
    // its `nombre` label - FirmaPass exposes no email or other identifying
    // field to match on automatically.
    async listFirmaPassValidations({ perPage } = {}) {
        const response = await api.get("/companies/admin/itcycle/firmapass/validations", {
            params: perPage ? { perPage } : undefined,
        });
        return response.data;
    },

    async getNextFirmaPassValidation() {
        const response = await api.get("/companies/admin/itcycle/firmapass/validations/nueva-solicitud");
        return response.data;
    },

    async getFirmaPassValidationDetail(validationUuid) {
        const response = await api.get(`/companies/admin/itcycle/firmapass/validations/${validationUuid}`);
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

    // Runs the DIAN habilitación "set de pruebas" (30 facturas, 10 notas
    // débito, 10 notas crédito) for a company already provisioned with
    // itcycle-api-dian - see Backend/services/dianTestMatrix.service.js.
    // Admin-only: this is the "onboarding asistido" step a client can't do
    // themselves.
    async startDianTestMatrixRun({ companyId, testSetId }) {
        const response = await api.post("/admin/dian-test-matrix/runs", { companyId, testSetId });
        return response.data;
    },

    async getDianTestMatrixRun(runId) {
        const response = await api.get(`/admin/dian-test-matrix/runs/${runId}`);
        return response.data;
    },

    async listDianTestMatrixRuns({ companyId } = {}) {
        const response = await api.get("/admin/dian-test-matrix/runs", {
            params: companyId ? { companyId } : undefined,
        });
        return response.data;
    },

    async cancelDianTestMatrixRun(runId) {
        const response = await api.post(`/admin/dian-test-matrix/runs/${runId}/cancel`);
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
