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
    // Nómina Electrónica (DIAN) - mirrors electronicInvoiceService.js's
    // issue/sync shape, scoped to one employee's payslip instead of one order.
    async getElectronicPayroll(documentId) {
        const response = await api.get(`/payroll/documents/${documentId}/electronic-payroll`);
        return response.data;
    },
    async issueElectronicPayroll(documentId) {
        const response = await api.post(`/payroll/documents/${documentId}/electronic-payroll/issue`, {}, idempotencyHeaders());
        return response.data;
    },
    async syncElectronicPayroll(documentId) {
        const response = await api.post(`/payroll/documents/${documentId}/electronic-payroll/sync`);
        return response.data;
    },
    async issueAllElectronicPayroll(periodId) {
        const response = await api.post(`/payroll/periods/${periodId}/electronic-payroll/issue-all`, {}, idempotencyHeaders());
        return response.data;
    },
    // Nómina Individual de Ajuste - adjustmentType is "1" (reemplazar) or "2" (eliminar).
    async issueElectronicPayrollAdjustment(documentId, adjustmentType) {
        const response = await api.post(
            `/payroll/documents/${documentId}/electronic-payroll/adjustments`,
            { adjustment_type: adjustmentType },
            idempotencyHeaders()
        );
        return response.data;
    },
    async syncElectronicPayrollAdjustment(documentId, adjustmentId) {
        const response = await api.post(`/payroll/documents/${documentId}/electronic-payroll/adjustments/${adjustmentId}/sync`);
        return response.data;
    },
    // Liquidación definitiva - preview never writes, so no idempotency key.
    async previewTermination({ employeeId, terminationDate, terminationReason, remainingWorkDays, manualIndemnityOverride }) {
        const response = await api.post("/payroll/terminations/preview", {
            employee_id: employeeId,
            termination_date: terminationDate,
            termination_reason: terminationReason,
            remaining_work_days: remainingWorkDays,
            manual_indemnity_override: manualIndemnityOverride,
        });
        return response.data;
    },
    async settleTermination({ employeeId, terminationDate, terminationReason, remainingWorkDays, manualIndemnityOverride, cashAccountId }) {
        const response = await api.post(
            "/payroll/terminations",
            {
                employee_id: employeeId,
                termination_date: terminationDate,
                termination_reason: terminationReason,
                remaining_work_days: remainingWorkDays,
                manual_indemnity_override: manualIndemnityOverride,
                cash_account_id: cashAccountId,
            },
            idempotencyHeaders()
        );
        return response.data;
    },
    async downloadTerminationPdf(employeeId) {
        const response = await api.get(`/payroll/terminations/${employeeId}/pdf`, { responseType: "blob" });
        return response.data;
    },
};
