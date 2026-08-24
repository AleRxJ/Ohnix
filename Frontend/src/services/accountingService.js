import { api } from "../api/api";

// Mirrors Backend/routes/accounting.routes.js one to one - all read-only
// except closeAccountingPeriod (gated "admin" server-side).
export const accountingService = {
    async listChartOfAccounts() {
        const response = await api.get("/accounting/chart-of-accounts");
        return response.data;
    },

    async listJournalEntries({ from, to, sourceType } = {}) {
        const response = await api.get("/accounting/journal-entries", {
            params: {
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(sourceType ? { source_type: sourceType } : {}),
            },
        });
        return response.data;
    },

    async getJournalEntry(id) {
        const response = await api.get(`/accounting/journal-entries/${id}`);
        return response.data;
    },

    async listAccountingPeriods() {
        const response = await api.get("/accounting/periods");
        return response.data;
    },

    async closeAccountingPeriod(id) {
        const response = await api.post(`/accounting/periods/${id}/close`);
        return response.data;
    },

    async getIncomeStatement({ from, to } = {}) {
        const response = await api.get("/accounting/reports/income-statement", {
            params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        });
        return response.data;
    },

    async getBalanceSheet({ asOf } = {}) {
        const response = await api.get("/accounting/reports/balance-sheet", {
            params: asOf ? { as_of: asOf } : undefined,
        });
        return response.data;
    },
};
