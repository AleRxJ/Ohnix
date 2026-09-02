import { api } from "../api/api";

// Mirrors Backend/routes/accounting.routes.js one to one - all read-only
// except closeAccountingPeriod (gated "admin" server-side).
export const accountingService = {
    async getStatus() {
        const response = await api.get("/accounting/status");
        return response.data;
    },

    async listCostCenters({ includeInactive = false } = {}) {
        const response = await api.get("/accounting/cost-centers", { params: { include_inactive: includeInactive } });
        return response.data;
    },

    async createCostCenter(payload) {
        const response = await api.post("/accounting/cost-centers", payload);
        return response.data;
    },

    async updateCostCenter(id, payload) {
        const response = await api.patch(`/accounting/cost-centers/${id}`, payload);
        return response.data;
    },

    async getCostCenterLedger(id, { from, to } = {}) {
        const response = await api.get(`/accounting/cost-centers/${id}/ledger`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } });
        return response.data;
    },

    async assignLocationCostCenter(pointOfSaleId, costCenterId) {
        const response = await api.patch(`/accounting/cost-centers/location/${pointOfSaleId}`, { cost_center_id: costCenterId || null });
        return response.data;
    },

    async listChartOfAccounts() {
        const response = await api.get("/accounting/chart-of-accounts");
        return response.data;
    },

    async createChartOfAccount({ code, name, accountType, parentId }) {
        const response = await api.post("/accounting/chart-of-accounts", {
            code,
            name,
            account_type: accountType,
            ...(parentId ? { parent_id: parentId } : {}),
        });
        return response.data;
    },

    async setChartOfAccountActive(id, isActive) {
        const response = await api.patch(`/accounting/chart-of-accounts/${id}/active`, { is_active: isActive });
        return response.data;
    },

    async getAccountLedger(id, { from, to } = {}) {
        const response = await api.get(`/accounting/chart-of-accounts/${id}/ledger`, {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        });
        return response.data;
    },

    async listJournalEntries({ from, to, sourceType, sourceId, costCenterId } = {}) {
        const response = await api.get("/accounting/journal-entries", {
            params: {
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(sourceType ? { source_type: sourceType } : {}),
                ...(sourceId ? { source_id: sourceId } : {}),
                ...(costCenterId ? { cost_center_id: costCenterId } : {}),
            },
        });
        return response.data;
    },

    async getJournalEntry(id) {
        const response = await api.get(`/accounting/journal-entries/${id}`);
        return response.data;
    },

    async listManualVouchers({ status } = {}) {
        const response = await api.get("/accounting/manual-vouchers", {
            params: status ? { status } : undefined,
        });
        return response.data;
    },

    async getManualVoucher(id) {
        const response = await api.get(`/accounting/manual-vouchers/${id}`);
        return response.data;
    },

    async createManualVoucher(payload) {
        const response = await api.post("/accounting/manual-vouchers", payload);
        return response.data;
    },

    async updateManualVoucher(id, payload) {
        const response = await api.put(`/accounting/manual-vouchers/${id}`, payload);
        return response.data;
    },

    async postManualVoucher(id) {
        const response = await api.post(`/accounting/manual-vouchers/${id}/post`);
        return response.data;
    },

    async voidManualVoucher(id, { reason, entryDate } = {}) {
        const response = await api.post(`/accounting/manual-vouchers/${id}/void`, {
            reason,
            ...(entryDate ? { entry_date: entryDate } : {}),
        });
        return response.data;
    },

    async listThirdPartyBalances({ from, to, type } = {}) {
        const response = await api.get("/accounting/third-parties", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(type ? { type } : {}) },
        });
        return response.data;
    },

    async getThirdPartyMovements(type, id, { from, to } = {}) {
        const response = await api.get(`/accounting/third-parties/${type}/${encodeURIComponent(id)}`, {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        });
        return response.data;
    },

    async listWithholdingConcepts({ activeAt } = {}) {
        const response = await api.get("/accounting/withholding-concepts", {
            params: activeAt ? { active_at: activeAt } : undefined,
        });
        return response.data;
    },

    async createWithholdingConcept(payload) {
        const response = await api.post("/accounting/withholding-concepts", payload);
        return response.data;
    },

    async setWithholdingConceptActive(id, isActive) {
        const response = await api.patch(`/accounting/withholding-concepts/${id}/active`, { is_active: isActive });
        return response.data;
    },

    async previewWithholdings(payload) {
        const response = await api.post("/accounting/withholding-concepts/preview", payload);
        return response.data;
    },

    async getWithholdingReport({ from, to, taxType, supplierId } = {}) {
        const response = await api.get("/accounting/reports/withholdings", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(taxType ? { tax_type: taxType } : {}), ...(supplierId ? { supplier_id: supplierId } : {}) },
        });
        return response.data;
    },

    async getWithholdingCertificate(supplierId, year) {
        const response = await api.get(`/accounting/reports/withholdings/certificates/${encodeURIComponent(supplierId)}`, { params: { year } });
        return response.data;
    },

    async downloadWithholdingCertificate(supplierId, year, document) {
        const response = await api.get(`/accounting/reports/withholdings/certificates/${encodeURIComponent(supplierId)}/pdf`, { params: { year }, responseType: "blob" });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `certificado-retenciones-${document || supplierId}-${year}.pdf`;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    async listAccountingPeriods() {
        const response = await api.get("/accounting/periods");
        return response.data;
    },

    async closeAccountingPeriod(id) {
        const response = await api.post(`/accounting/periods/${id}/close`);
        return response.data;
    },

    async getAccountingPeriodCloseReadiness(id) {
        const response = await api.get(`/accounting/periods/${id}/close-readiness`);
        return response.data;
    },

    async reopenAccountingPeriod(id, { reason, durationHours }) {
        const response = await api.post(`/accounting/periods/${id}/reopen`, {
            reason,
            duration_hours: durationHours,
        });
        return response.data;
    },

    async getIncomeStatement({ from, to, costCenterId } = {}) {
        const response = await api.get("/accounting/reports/income-statement", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(costCenterId ? { cost_center_id: costCenterId } : {}) },
        });
        return response.data;
    },

    async getIncomeStatementComparison({ from, to } = {}) {
        const response = await api.get("/accounting/reports/income-statement/comparison", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        });
        return response.data;
    },

    async getBalanceSheet({ asOf, costCenterId } = {}) {
        const response = await api.get("/accounting/reports/balance-sheet", {
            params: { ...(asOf ? { as_of: asOf } : {}), ...(costCenterId ? { cost_center_id: costCenterId } : {}) },
        });
        return response.data;
    },

    async getTrialBalance({ from, to, costCenterId } = {}) {
        const response = await api.get("/accounting/reports/trial-balance", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(costCenterId ? { cost_center_id: costCenterId } : {}) },
        });
        return response.data;
    },
};
