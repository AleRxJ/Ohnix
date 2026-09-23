import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/finance.routes.js one to one. Shared across three
// screens (Finance page, OrderDetailsDrawer, PurchaseDetails) - unlike
// orders/purchases (inline `api` calls per hook), this is a real service
// module because there's no single "owning" hook for it, same reasoning as
// companyService.js/teamService.js.
export const financeService = {
    async listCashAccounts({ includeInactive = false } = {}) {
        const response = await api.get("/finance/cash-accounts", {
            params: includeInactive ? { include_inactive: "true" } : undefined,
        });
        return response.data;
    },

    async createCashAccount(payload) {
        const response = await api.post("/finance/cash-accounts", payload);
        return response.data;
    },

    async updateCashAccount(id, payload) {
        const response = await api.patch(`/finance/cash-accounts/${id}`, payload);
        return response.data;
    },

    async deactivateCashAccount(id) {
        const response = await api.post(`/finance/cash-accounts/${id}/deactivate`);
        return response.data;
    },

    async registerManualExpense(payload) {
        const response = await api.post("/finance/expenses", payload);
        return response.data;
    },

    async listCashAccountMovements(id) {
        const response = await api.get(`/finance/cash-accounts/${id}/movements`);
        return response.data;
    },

    async listOrderPayments(orderId) {
        const response = await api.get(`/finance/orders/${orderId}/payments`);
        return response.data;
    },

    async registerOrderPayment(orderId, payload) {
        const response = await api.post(`/finance/orders/${orderId}/payments`, payload);
        return response.data;
    },

    async listPurchasePayments(purchaseId) {
        const response = await api.get(`/finance/purchases/${purchaseId}/payments`);
        return response.data;
    },

    async registerPurchasePayment(purchaseId, payload) {
        const response = await api.post(`/finance/purchases/${purchaseId}/payments`, payload);
        return response.data;
    },

    async getAccountsPayablePlan() {
        const response = await api.get("/finance/accounts-payable");
        return response.data;
    },

    async updatePurchaseDueDate(purchaseId, dueDate) {
        const response = await api.patch(`/finance/purchases/${purchaseId}/due-date`, { due_date: dueDate });
        return response.data;
    },

    async getAccountsReceivablePlan() {
        const response = await api.get("/finance/accounts-receivable");
        return response.data;
    },

    async updateOrderDueDate(orderId, dueDate) {
        const response = await api.patch(`/finance/orders/${orderId}/due-date`, { due_date: dueDate });
        return response.data;
    },

    async createStatementEntries(cashAccountId, entries) {
        const response = await api.post("/finance/reconciliation/statement-entries", {
            cash_account_id: cashAccountId,
            entries,
        });
        return response.data;
    },

    async listUnmatchedEntries(cashAccountId) {
        const response = await api.get("/finance/reconciliation/unmatched-entries", {
            params: { cash_account_id: cashAccountId },
        });
        return response.data;
    },

    async listUnmatchedMovements(cashAccountId) {
        const response = await api.get("/finance/reconciliation/unmatched-movements", {
            params: { cash_account_id: cashAccountId },
        });
        return response.data;
    },

    async matchEntry({ cashAccountId, entryId, movementId }) {
        const response = await api.post("/finance/reconciliation/match", {
            cash_account_id: cashAccountId,
            entry_id: entryId,
            movement_id: movementId,
        });
        return response.data;
    },
    async listCashAccountConfigurationHistory(id) {
        const response = await api.get(`/finance/cash-accounts/${id}/configuration-history`);
        return response.data;
    },

    async registerManualIncome(payload) {
        const response = await api.post("/finance/income", payload);
        return response.data;
    },
    async transferCash(payload) {
        const response = await api.post("/finance/transfers", payload, idempotencyHeaders());
        return response.data;
    },
    async adjustCash(payload) {
        const response = await api.post("/finance/adjustments", payload, idempotencyHeaders());
        return response.data;
    },
    async getCashIntegrity() {
        const response = await api.get("/finance/integrity");
        return response.data;
    },
    async getReconciliationSuggestions(cashAccountId) {
        const response = await api.get("/finance/reconciliation/suggestions", { params: { cash_account_id: cashAccountId } });
        return response.data;
    },
    async getReconciliationSummary(cashAccountId) {
        const response = await api.get("/finance/reconciliation/summary", { params: { cash_account_id: cashAccountId } });
        return response.data;
    },
    async getReconciliationReport(cashAccountId, params = {}) {
        const response = await api.get("/finance/reconciliation/report", { params: { cash_account_id: cashAccountId, ...params } });
        return response.data;
    },
    async allocateOrderPayment(orderId, paymentId, amount) { const response = await api.post(`/finance/orders/${orderId}/payments/${paymentId}/allocate`, { amount }); return response.data; },
    async listOrderPaymentAllocations(orderId, paymentId) { const response = await api.get(`/finance/orders/${orderId}/payments/${paymentId}/allocations`); return response.data; },
    async allocatePurchasePayment(purchaseId, paymentId, amount) { const response = await api.post(`/finance/purchases/${purchaseId}/payments/${paymentId}/allocate`, { amount }); return response.data; },
    async listPurchasePaymentAllocations(purchaseId, paymentId) { const response = await api.get(`/finance/purchases/${purchaseId}/payments/${paymentId}/allocations`); return response.data; },
    async listUnallocatedPayments(type) { const response = await api.get("/finance/payments/unallocated", { params: { type } }); return response.data; },
    async listPaymentCredits(params = {}) { const response = await api.get("/finance/payment-credits", { params }); return response.data; },
    async applyPaymentCredit(creditId, payload) { const response = await api.post(`/finance/payment-credits/${creditId}/apply`, payload); return response.data; },

    async getCarteraReport(params) {
        const response = await api.get("/reports/cartera", { params });
        return response.data;
    },

    async listPaymentMethods({ activeOnly = false } = {}) {
        const response = await api.get("/finance/payment-methods", {
            params: activeOnly ? { active_only: "true" } : undefined,
        });
        return response.data;
    },
    async createPaymentMethod(payload) {
        const response = await api.post("/finance/payment-methods", payload);
        return response.data;
    },
    async updatePaymentMethod(id, payload) {
        const response = await api.patch(`/finance/payment-methods/${id}`, payload);
        return response.data;
    },
    async setPaymentMethodActive(id, isActive) {
        const response = await api.patch(`/finance/payment-methods/${id}/active`, { is_active: isActive });
        return response.data;
    },
};
