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

    async listRecurringExpenses({ includeInactive = false } = {}) {
        const response = await api.get("/accounting/recurring-expenses", { params: { include_inactive: includeInactive } });
        return response.data;
    },

    async createRecurringExpense(payload) {
        const response = await api.post("/accounting/recurring-expenses", payload);
        return response.data;
    },

    async updateRecurringExpense(id, payload) {
        const response = await api.patch(`/accounting/recurring-expenses/${id}`, payload);
        return response.data;
    },

    async runRecurringExpenseNow(id) {
        const response = await api.post(`/accounting/recurring-expenses/${id}/run`);
        return response.data;
    },

    async listFixedAssets({ includeInactive = false } = {}) {
        const response = await api.get("/accounting/fixed-assets", { params: { include_inactive: includeInactive } });
        return response.data;
    },

    async createFixedAsset(payload) {
        const response = await api.post("/accounting/fixed-assets", payload);
        return response.data;
    },

    async updateFixedAsset(id, payload) {
        const response = await api.patch(`/accounting/fixed-assets/${id}`, payload);
        return response.data;
    },

    async disposeFixedAsset(id, { reason, disposalAmount, cashAccountId }) {
        const response = await api.post(`/accounting/fixed-assets/${id}/dispose`, {
            reason,
            disposal_amount: disposalAmount,
            cash_account_id: cashAccountId,
        });
        return response.data;
    },

    async runFixedAssetDepreciationNow(id) {
        const response = await api.post(`/accounting/fixed-assets/${id}/run`);
        return response.data;
    },
    async listPrepaidExpenses({ includeInactive = false } = {}) {
        const response = await api.get("/accounting/prepaid-expenses", { params: { include_inactive: includeInactive } });
        return response.data;
    },
    async createPrepaidExpense(payload) {
        const response = await api.post("/accounting/prepaid-expenses", payload);
        return response.data;
    },
    async updatePrepaidExpense(id, payload) {
        const response = await api.patch(`/accounting/prepaid-expenses/${id}`, payload);
        return response.data;
    },
    async runPrepaidAmortizationNow(id) {
        const response = await api.post(`/accounting/prepaid-expenses/${id}/run`);
        return response.data;
    },
    async cancelPrepaidExpense(id, reason) {
        const response = await api.post(`/accounting/prepaid-expenses/${id}/cancel`, { reason });
        return response.data;
    },
    async listImpairmentRuns() {
        const response = await api.get("/accounting/receivable-impairment/runs");
        return response.data;
    },
    async previewImpairment(payload) {
        const response = await api.post("/accounting/receivable-impairment/preview", payload);
        return response.data;
    },
    async runImpairment(payload) {
        const response = await api.post("/accounting/receivable-impairment/run", payload);
        return response.data;
    },
    async listFinancialObligations() {
        const response = await api.get("/accounting/financial-obligations");
        return response.data;
    },
    async previewObligationSchedule(payload) {
        const response = await api.post("/accounting/financial-obligations/schedule-preview", payload);
        return response.data;
    },
    async createFinancialObligation(payload) {
        const response = await api.post("/accounting/financial-obligations", payload);
        return response.data;
    },
    async payObligationInstallment(id, payload) {
        const response = await api.post(`/accounting/financial-obligations/${id}/pay`, payload);
        return response.data;
    },
    async getInventoryValuation(params = {}) {
        const response = await api.get("/accounting/reports/inventory-valuation", { params });
        return response.data;
    },
    async getProductKardex(productId, params = {}) {
        const response = await api.get(`/accounting/reports/kardex/${productId}`, { params });
        return response.data;
    },
    async listIcaDeclarations() {
        const response = await api.get("/accounting/ica-declarations");
        return response.data;
    },
    async previewIcaDeclaration(params) {
        const response = await api.get("/accounting/ica-declarations/preview", { params });
        return response.data;
    },
    async settleIcaDeclaration(payload) {
        const response = await api.post("/accounting/ica-declarations", payload);
        return response.data;
    },
    async voidIcaDeclaration(id, reason) {
        const response = await api.post(`/accounting/ica-declarations/${id}/void`, { reason });
        return response.data;
    },
    async payIcaDeclaration(id, payload) {
        const response = await api.post(`/accounting/ica-declarations/${id}/pay`, payload);
        return response.data;
    },

    async listRecurringJournalTemplates({ includeInactive = false } = {}) {
        const response = await api.get("/accounting/recurring-journals", { params: { include_inactive: includeInactive } });
        return response.data;
    },

    async createRecurringJournalTemplate(payload) {
        const response = await api.post("/accounting/recurring-journals", payload);
        return response.data;
    },

    async updateRecurringJournalTemplate(id, payload) {
        const response = await api.patch(`/accounting/recurring-journals/${id}`, payload);
        return response.data;
    },

    async runRecurringJournalTemplateNow(id) {
        const response = await api.post(`/accounting/recurring-journals/${id}/run`);
        return response.data;
    },

    async getBudgetReport({ year, month, costCenterId } = {}) {
        const response = await api.get("/accounting/budgets", { params: { year, month, ...(costCenterId ? { cost_center_id: costCenterId } : {}) } });
        return response.data;
    },

    async saveBudgets({ year, month, items }) {
        const response = await api.put("/accounting/budgets", { year, month, items });
        return response.data;
    },

    async deleteBudget(id) {
        const response = await api.delete(`/accounting/budgets/${id}`);
        return response.data;
    },

    async getAnnualBudgetReport({ year, costCenterId } = {}) {
        const response = await api.get("/accounting/budgets-annual", { params: { year, ...(costCenterId ? { cost_center_id: costCenterId } : {}) } });
        return response.data;
    },

    async distributeAnnualBudget(payload) {
        const response = await api.post("/accounting/budgets-annual/distribute", payload);
        return response.data;
    },

    async copyAnnualBudget(payload) {
        const response = await api.post("/accounting/budgets-annual/copy", payload);
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

    async createOpeningBalance(payload) {
        const response = await api.post("/accounting/opening-balance", payload);
        return response.data;
    },
    async listAudit(params = {}) {
        const response = await api.get("/accounting/audit", { params });
        return response.data;
    },
    async reverseJournalEntry(id, payload) {
        const response = await api.post(`/accounting/journal-entries/${id}/reverse`, payload);
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

    async getExogenaReport(year) {
        const response = await api.get("/accounting/reports/exogena", { params: { year } });
        return response.data;
    },
    async listVatSettlements() {
        const response = await api.get("/accounting/vat-settlements");
        return response.data;
    },
    async previewVatSettlement(params) {
        const response = await api.get("/accounting/vat-settlements/preview", { params });
        return response.data;
    },
    async settleVatPeriod(payload) {
        const response = await api.post("/accounting/vat-settlements", payload);
        return response.data;
    },
    async voidVatSettlement(id, reason) {
        const response = await api.post(`/accounting/vat-settlements/${id}/void`, { reason });
        return response.data;
    },
    async payVatSettlement(id, payload) {
        const response = await api.post(`/accounting/vat-settlements/${id}/pay`, payload);
        return response.data;
    },

    async getWithholdingCertificate(supplierId, year) {
        const response = await api.get(`/accounting/reports/withholdings/certificates/${encodeURIComponent(supplierId)}`, { params: { year } });
        return response.data;
    },

    async downloadWithholdingCertificate(supplierId, year, document, language = "es") {
        const response = await api.get(`/accounting/reports/withholdings/certificates/${encodeURIComponent(supplierId)}/pdf`, { params: { year, language }, responseType: "blob" });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `${language === "en" ? "withholding-certificate" : "certificado-retenciones"}-${document || supplierId}-${year}.pdf`;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    async getRentaDeclaration({ year, manualAdjustments, anticipoTier } = {}) {
        const response = await api.get("/accounting/reports/renta", {
            params: { year, ...(manualAdjustments ? { manual_adjustments: manualAdjustments } : {}), ...(anticipoTier ? { anticipo_tier: anticipoTier } : {}) },
        });
        return response.data;
    },

    async downloadRentaDeclarationPdf({ year, manualAdjustments, anticipoTier } = {}) {
        const response = await api.get("/accounting/reports/renta/pdf", {
            params: { year, ...(manualAdjustments ? { manual_adjustments: manualAdjustments } : {}), ...(anticipoTier ? { anticipo_tier: anticipoTier } : {}) },
            responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `declaracion-renta-estimada-${year}.pdf`;
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

    async listFiscalYearClosures() {
        const response = await api.get("/accounting/fiscal-years");
        return response.data;
    },

    async getFiscalYearCloseReadiness(year) {
        const response = await api.get(`/accounting/fiscal-years/${year}/close-readiness`);
        return response.data;
    },

    async closeFiscalYear(year) {
        const response = await api.post(`/accounting/fiscal-years/${year}/close`);
        return response.data;
    },

    async reopenFiscalYear(year, { reason, durationHours }) {
        const response = await api.post(`/accounting/fiscal-years/${year}/reopen`, {
            reason,
            duration_hours: durationHours,
        });
        return response.data;
    },

    async listFinancialStatementNotes(year) {
        const response = await api.get("/accounting/financial-statement-notes", { params: { year } });
        return response.data;
    },

    async createFinancialStatementNote({ year, title, content }) {
        const response = await api.post("/accounting/financial-statement-notes", { year, title, content });
        return response.data;
    },

    async updateFinancialStatementNote(id, { title, content }) {
        const response = await api.put(`/accounting/financial-statement-notes/${id}`, { title, content });
        return response.data;
    },

    async deleteFinancialStatementNote(id) {
        const response = await api.delete(`/accounting/financial-statement-notes/${id}`);
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

    async getCashFlowStatement({ from, to } = {}) {
        const response = await api.get("/accounting/reports/cash-flow", {
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

    async getEquityChangesStatement({ from, to } = {}) {
        const response = await api.get("/accounting/reports/equity-changes", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
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
