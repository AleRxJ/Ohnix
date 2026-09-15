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
    // admin browse that queue and match a validation to an Ohnix company -
    // by `orderNumber` (exact server-side lookup) when a real purchase set
    // one, otherwise by eye via `nombre`/`owner_email`.
    async listFirmaPassValidations({ perPage, orderNumber } = {}) {
        const params = {};
        if (perPage) params.perPage = perPage;
        if (orderNumber) params.orderNumber = orderNumber;
        const response = await api.get("/companies/admin/itcycle/firmapass/validations", {
            params: Object.keys(params).length ? params : undefined,
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

    // Cross-company CertificateOrder visibility - see
    // Backend/services/certificateOrder.service.js#listCertificateOrdersAdmin.
    async listCertificateOrders() {
        const response = await api.get("/companies/admin/itcycle/certificate-orders");
        return response.data;
    },

    // External API clients: companies with no Ohnix account (their own
    // POS/ERP/SaaS) provisioned directly on itcycle-api-dian to integrate
    // against Ohnix's DIAN e-invoicing engine via API - see
    // Backend/services/externalApiClient.service.js. issueExternalApiClientApiKey
    // returns the raw key in the response body EXACTLY ONCE; it is never
    // persisted anywhere, so there is no "get key" call to pair with this.
    async listExternalApiClients() {
        const response = await api.get("/companies/admin/itcycle/external-clients");
        return response.data;
    },

    async createExternalApiClient(payload) {
        const response = await api.post("/companies/admin/itcycle/external-clients", payload);
        return response.data;
    },

    async issueExternalApiClientApiKey(id, label) {
        const response = await api.post(`/companies/admin/itcycle/external-clients/${id}/api-keys`, { label });
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

    async setUserPassword(userId, password) {
        const response = await api.patch(`/users/admin/users/${userId}/password`, { password });
        return response.data;
    },

    async impersonateUser(userId) {
        const response = await api.post(`/users/admin/users/${userId}/impersonate`);
        return response.data;
    },

    // Any user's active devices, not just the caller's own - e.g. a
    // compromised-account report, or a user who can't reach their own
    // "Sesiones activas" tab to sign out a lost device.
    async getUserSessionsAdmin(userId) {
        const response = await api.get(`/users/admin/users/${userId}/sessions`);
        return response.data;
    },

    async revokeUserSessionAdmin(userId, sessionId) {
        const response = await api.delete(`/users/admin/users/${userId}/sessions/${sessionId}`);
        return response.data;
    },

    // System-wide "Sesiones" tab: every device logged in across every user
    // and company at once, not scoped to a single account.
    async listAllSessions() {
        const response = await api.get("/users/admin/sessions");
        return response.data;
    },

    async revokeAnySession(sessionId) {
        const response = await api.delete(`/users/admin/sessions/${sessionId}`);
        return response.data;
    },

    // Runs the DIAN habilitación "set de pruebas" for a company already
    // provisioned with itcycle-api-dian - see
    // Backend/services/dianTestMatrix.service.js. Admin-only: this is the
    // "onboarding asistido" step a client can't do themselves. Document
    // counts default to 1/1/1 on the backend when omitted here - see that
    // file's own comment on why a fixed 30/10/10 for every company was
    // dropped.
    async startDianTestMatrixRun({ companyId, testSetId, invoiceTarget, creditNoteTarget, debitNoteTarget }) {
        const response = await api.post("/admin/dian-test-matrix/runs", {
            companyId,
            testSetId,
            invoiceTarget,
            creditNoteTarget,
            debitNoteTarget,
        });
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

    async retryFailedDianTestMatrixDocuments(runId) {
        const response = await api.post(`/admin/dian-test-matrix/runs/${runId}/retry-failed`);
        return response.data;
    },

    // The raw DIAN SOAP response for one test-matrix document - a genuine
    // DIAN rejection can come back with no statusDescription/errorMessage at
    // all, and this is the only way to see what DIAN actually said.
    async getDianTestMatrixDocumentRawResponse(docId) {
        const response = await api.get(`/admin/dian-test-matrix/documents/${docId}/raw-response`);
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
