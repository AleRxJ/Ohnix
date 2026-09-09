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

    // Which certificate provider (firmapass|viafirma) signs this company's
    // real documents - only meaningful once activeProviders has more than
    // one entry (an ACTIVE certificate from both at once).
    async getMyCertificateProviderStatus() {
        const response = await api.get("/company/me/itcycle/certificate-provider");
        return response.data;
    },

    async setMyCertificateProviderOverride(provider) {
        const response = await api.put("/company/me/itcycle/certificate-provider", { provider });
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

    // Only "91"/"92" (nota crédito/débito) can be corrected this way, and
    // only while unused - see Backend/services/electronicInvoicing.service.js's
    // updateItcycleNumberingResolutionForCompany for both restrictions.
    async updateMyItcycleNumberingResolution(resolutionId, payload) {
        const response = await api.patch(`/company/me/itcycle/numbering-resolutions/${resolutionId}`, payload);
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

    // Alternative to the FirmaPass rut/archivos/confirmar wizard: hand
    // itcycle-api-dian a certificate bought/obtained elsewhere directly.
    async uploadMyCertificate(payload, idempotencyKey) {
        const response = await api.post("/company/me/itcycle/certificates", payload, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    // CEA-3.0-07 art. 10.11.1.e - the applicant must see and explicitly
    // accept these before createMyViafirmaRequest will accept the request
    // (server-side enforced, not just a UI nicety - see that endpoint).
    async getMyViafirmaTerms(profileKind) {
        const response = await api.get(`/company/me/itcycle/viafirma/terms?profileKind=${encodeURIComponent(profileKind)}`);
        return response.data;
    },

    // DIAN-mandatory payment gate in front of createMyViafirmaRequest below -
    // see CertificateOrder's doc comment in schema.prisma. `activeEntitlement`
    // is null when nothing paid is currently valid for this company.
    async getMyCertificateOrders() {
        const response = await api.get("/company/me/itcycle/viafirma/certificate-orders");
        return response.data;
    },

    // Creates (or reuses an already-pending) order for the chosen duration -
    // does not charge anything by itself, only sets up the ePayco checkout
    // session getMyCertificateOrderCheckoutParams then opens.
    async createMyCertificateOrder(durationYears, idempotencyKey) {
        const response = await api.post("/company/me/itcycle/viafirma/certificate-orders", { durationYears }, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async getMyCertificateOrderCheckoutParams(orderId) {
        const response = await api.get(`/company/me/itcycle/viafirma/certificate-orders/${orderId}/epayco-params`);
        return response.data;
    },

    // Gives resolvePendingCertificateOrderPaymentStatus's live-query fallback
    // a real ref_payco to check when the signed confirmation webhook can't
    // reach this backend at all (localhost in dev) or misses a cold start
    // (Render in prod) - see reportMyCertificateOrderTransactionReference's
    // own doc comment. Never trusted for activation by itself.
    async reportMyCertificateOrderTransactionReference(orderId, refPayco) {
        if (!refPayco) return null;
        const response = await api.post(`/company/me/itcycle/viafirma/certificate-orders/${orderId}/epayco-reference`, { refPayco });
        return response.data;
    },

    // Self-reported "the customer closed the ePayco checkout without
    // finishing" signal - see reportMyCertificateOrderCheckoutClosed's own
    // doc comment for the safety model (can only ever cancel, never pay).
    async reportMyCertificateOrderCheckoutClosed(orderId) {
        const response = await api.post(`/company/me/itcycle/viafirma/certificate-orders/${orderId}/epayco-checkout-closed`);
        return response.data;
    },

    // Viafirma Colombia digital-certificate issuance - unlike FirmaPass,
    // there's no pre-existing validation to look up first: the CSR/keypair
    // are generated server-side (itcycle-api-dian) by this one call, which
    // returns { certificateId, codRequest } to drive every step after.
    async createMyViafirmaRequest(payload, idempotencyKey) {
        const response = await api.post("/company/me/itcycle/viafirma/requests", payload, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    // How the UI recovers "do I already have an in-progress or active
    // Viafirma certificate" after a page reload - certificateId isn't
    // derivable from anything Viafirma itself hands back.
    async getMyViafirmaCertificates() {
        const response = await api.get("/company/me/itcycle/viafirma/certificates");
        return response.data;
    },

    async getMyViafirmaCertificateStatus(certificateId) {
        const response = await api.get(`/company/me/itcycle/viafirma/certificates/${certificateId}/status`);
        return response.data;
    },

    // Only meaningful while status is "awaiting_identity_verification" -
    // Viafirma itself errors out for any other status.
    async getMyViafirmaKycLink(certificateId) {
        const response = await api.get(`/company/me/itcycle/viafirma/certificates/${certificateId}/kyc-link`);
        return response.data;
    },

    async uploadMyViafirmaDocument(certificateId, payload) {
        const response = await api.post(`/company/me/itcycle/viafirma/certificates/${certificateId}/documents`, payload);
        return response.data;
    },

    async listMyViafirmaDocuments(certificateId) {
        const response = await api.get(`/company/me/itcycle/viafirma/certificates/${certificateId}/documents`);
        return response.data;
    },

    async revokeMyViafirmaCertificate(certificateId, payload) {
        const response = await api.post(`/company/me/itcycle/viafirma/certificates/${certificateId}/revoke`, payload);
        return response.data;
    },

    // Self-service DIAN habilitación (test-matrix) - see
    // Backend/routes/dianTestMatrixSelf.routes.js. testSetId itself still
    // comes from DIAN's own habilitación portal (no API for that exists);
    // everything from here on (start/monitor/cancel/request production) the
    // owner drives themselves.
    async startMyDianTestMatrixRun(payload, idempotencyKey) {
        const response = await api.post("/company/dian-test-matrix/runs", payload, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async listMyDianTestMatrixRuns() {
        const response = await api.get("/company/dian-test-matrix/runs");
        return response.data;
    },

    async getMyDianTestMatrixRun(runId) {
        const response = await api.get(`/company/dian-test-matrix/runs/${runId}`);
        return response.data;
    },

    async cancelMyDianTestMatrixRun(runId) {
        const response = await api.post(`/company/dian-test-matrix/runs/${runId}/cancel`);
        return response.data;
    },

    async requestMyDianProductionActivation(runId, idempotencyKey) {
        const response = await api.post(`/company/dian-test-matrix/runs/${runId}/request-production`, undefined, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },

    async retryMyFailedDianTestMatrixDocuments(runId, idempotencyKey) {
        const response = await api.post(`/company/dian-test-matrix/runs/${runId}/retry-failed`, undefined, {
            headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        });
        return response.data;
    },
};
