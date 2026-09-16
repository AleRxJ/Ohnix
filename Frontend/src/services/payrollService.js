import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/payroll.routes.js one to one. See
// Backend/controllers/payroll.controller.js for the response shape.
export const payrollService = {
    async listPeriods() {
        const response = await api.get("/payroll/periods");
        return response.data;
    },
    async getPeriod(id) {
        const response = await api.get(`/payroll/periods/${id}`);
        return response.data;
    },
    async createPeriod({ periodicity, startDate, endDate, paymentDate, employeeIds }) {
        const response = await api.post(
            "/payroll/periods",
            { periodicity, start_date: startDate, end_date: endDate, payment_date: paymentDate, employee_ids: employeeIds },
            idempotencyHeaders()
        );
        return response.data;
    },
    async calculatePeriod(id) {
        const response = await api.patch(`/payroll/periods/${id}/calculate`, {}, idempotencyHeaders());
        return response.data;
    },
    async approvePeriod(id) {
        const response = await api.patch(`/payroll/periods/${id}/approve`, {}, idempotencyHeaders());
        return response.data;
    },
    async payPeriod(id, { cashAccountId, paymentDate }) {
        const response = await api.patch(
            `/payroll/periods/${id}/pay`,
            { cash_account_id: cashAccountId, payment_date: paymentDate },
            idempotencyHeaders()
        );
        return response.data;
    },
    async cancelPeriod(id) {
        const response = await api.patch(`/payroll/periods/${id}/cancel`, {}, idempotencyHeaders());
        return response.data;
    },
    async updateWorkedDays(documentId, workedDays) {
        const response = await api.patch(`/payroll/documents/${documentId}/worked-days`, { worked_days: workedDays });
        return response.data;
    },
    // Fetched as an authenticated blob (like every other PDF in this app -
    // see useOrderOperations.js#downloadInvoice) rather than a raw URL,
    // since the endpoint requires the bearer token a plain <a href> can't
    // carry.
    async downloadPayslipPdf(documentId) {
        const response = await api.get(`/payroll/documents/${documentId}/payslip.pdf`, { responseType: "blob" });
        return response.data;
    },
    async listBenefitAccruals(employeeId) {
        const params = new URLSearchParams();
        if (employeeId) params.append("employee_id", employeeId);
        const response = await api.get(`/payroll/benefit-accruals?${params.toString()}`);
        return response.data;
    },
    async settleBenefit({ employeeId, type, year, semester, cashAccountId }) {
        const response = await api.post(
            "/payroll/benefit-settlements",
            { employee_id: employeeId, type, year, semester, cash_account_id: cashAccountId },
            idempotencyHeaders()
        );
        return response.data;
    },
    async listLegalParameters() {
        const response = await api.get("/payroll/legal-parameters");
        return response.data;
    },
    async saveLegalParameters(payload) {
        const response = await api.post("/payroll/legal-parameters", {
            year: payload.year,
            smlmv: payload.smlmv,
            transport_allowance: payload.transportAllowance,
            uvt: payload.uvt,
            monthly_work_hours: payload.monthlyWorkHours,
            pension_solidarity_brackets: payload.pensionSolidarityBrackets,
        });
        return response.data;
    },
};
