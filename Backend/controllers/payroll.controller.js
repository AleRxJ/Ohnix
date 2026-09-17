import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { streamReportPdf } from "../utils/reportPdf.js";
import * as payrollService from "../services/payroll.service.js";

// Spanish labels for the PDF - the enum values themselves (payroll.
// service.js#calculateDocumentLines) stay English/snake_case like every
// other enum in this codebase, this is presentation-only.
const CONCEPT_LABELS = {
    basic_salary: "Salario básico",
    transport_allowance: "Auxilio de transporte",
    overtime_day: "Horas extra diurnas",
    overtime_night: "Horas extra nocturnas",
    surcharge_night: "Recargo nocturno",
    surcharge_sunday_holiday: "Recargo dominical/festivo",
    overtime_sunday_holiday_day: "Horas extra diurnas dominical/festivo",
    overtime_sunday_holiday_night: "Horas extra nocturnas dominical/festivo",
    common_vacation: "Vacaciones",
    bonus: "Bonificación",
    other_earning: "Otros devengados",
    health_employee: "Salud (empleado)",
    pension_employee: "Pensión (empleado)",
    pension_solidarity_fund: "Fondo de solidaridad pensional",
    withholding_tax: "Retención en la fuente",
    other_deduction: "Otras deducciones",
    health_employer: "Salud (empleador)",
    pension_employer: "Pensión (empleador)",
    arl: "ARL",
    sena: "SENA",
    icbf: "ICBF",
    compensation_fund: "Caja de compensación",
    severance_employer: "Cesantías",
    severance_interest_employer: "Intereses a las cesantías",
    service_bonus_employer: "Prima de servicios",
    vacation_provision: "Provisión de vacaciones",
};
const conceptLabel = (code) => CONCEPT_LABELS[code] || code;

const mapLine = (line) => ({
    _id: line.id,
    category: line.category,
    concept_code: line.conceptCode,
    description: line.description,
    quantity: line.quantity === null ? null : Number(line.quantity),
    rate: line.rate === null ? null : Number(line.rate),
    amount: Number(line.amount),
});

const mapDocument = (document) => ({
    _id: document.id,
    employee_id: document.employeeId,
    employee_name: document.employee
        ? [document.employee.firstName, document.employee.lastName].filter(Boolean).join(" ")
        : undefined,
    worked_days: Number(document.workedDays),
    base_salary_snapshot: Number(document.baseSalarySnapshot),
    status: document.status,
    total_earnings: Number(document.totalEarnings),
    total_deductions: Number(document.totalDeductions),
    total_employer_contributions: Number(document.totalEmployerContributions),
    net_pay: Number(document.netPay),
    lines: (document.lines || []).map(mapLine),
});

const mapPeriod = (period) => ({
    _id: period.id,
    periodicity: period.periodicity,
    start_date: period.startDate,
    end_date: period.endDate,
    payment_date: period.paymentDate,
    status: period.status,
    calculated_at: period.calculatedAt,
    approved_at: period.approvedAt,
    paid_at: period.paidAt,
    cancelled_at: period.cancelledAt,
    documents: (period.documents || []).map(mapDocument),
    total_net_pay: (period.documents || []).reduce((sum, d) => sum + Number(d.netPay), 0),
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
});

const mapAccrual = (accrual) => ({
    _id: accrual.id,
    employee_id: accrual.employeeId,
    employee_name: accrual.employee ? [accrual.employee.firstName, accrual.employee.lastName].filter(Boolean).join(" ") : undefined,
    year: accrual.year,
    semester: accrual.semester,
    type: accrual.type,
    accrued_amount: Number(accrual.accruedAmount),
    settled_amount: Number(accrual.settledAmount),
    pending_amount: Number(accrual.accruedAmount) - Number(accrual.settledAmount),
    accrued_days: Number(accrual.accruedDays),
    used_days: Number(accrual.usedDays),
});

const handle = (fn) =>
    asyncHandler(async (req, res, next) => {
        try {
            await fn(req, res);
        } catch (error) {
            if (error instanceof ApiError) return next(error);
            console.error(error);
            return next(new ApiError(500, "Something went wrong. Please try again."));
        }
    });

export const createPayrollPeriod = handle(async (req, res) => {
    const { periodicity, start_date, end_date, payment_date, employee_ids } = req.body || {};
    const period = await payrollService.createPayrollPeriod({
        accountId: req.user.prismaId,
        periodicity,
        startDate: start_date,
        endDate: end_date,
        paymentDate: payment_date,
        employeeIds: employee_ids,
    });
    return res.status(201).json(new ApiResponse(201, mapPeriod(period), "Payroll period created successfully"));
});

export const listPayrollPeriods = handle(async (req, res) => {
    const periods = await payrollService.listPayrollPeriods(req.user.prismaId);
    return res.status(200).json(new ApiResponse(200, periods.map(mapPeriod), "Payroll periods fetched successfully"));
});

export const getPayrollPeriod = handle(async (req, res) => {
    const period = await payrollService.getPayrollPeriod(req.user.prismaId, req.params.id);
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Payroll period fetched successfully"));
});

export const updateDocumentWorkedDays = handle(async (req, res) => {
    const document = await payrollService.updateDocumentWorkedDays({
        accountId: req.user.prismaId,
        documentId: req.params.documentId,
        workedDays: req.body?.worked_days,
    });
    return res.status(200).json(new ApiResponse(200, mapDocument(document), "Updated successfully"));
});

export const calculatePayrollPeriod = handle(async (req, res) => {
    const period = await payrollService.calculatePayrollPeriod({ accountId: req.user.prismaId, periodId: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Payroll period calculated successfully"));
});

export const approvePayrollPeriod = handle(async (req, res) => {
    const period = await payrollService.approvePayrollPeriod({ accountId: req.user.prismaId, periodId: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Payroll period approved successfully"));
});

export const payPayrollPeriod = handle(async (req, res) => {
    const period = await payrollService.payPayrollPeriod({
        accountId: req.user.prismaId,
        periodId: req.params.id,
        cashAccountId: req.body?.cash_account_id,
        paymentDate: req.body?.payment_date,
    });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Payroll period paid successfully"));
});

export const cancelPayrollPeriod = handle(async (req, res) => {
    const period = await payrollService.cancelPayrollPeriod({ accountId: req.user.prismaId, periodId: req.params.id });
    return res.status(200).json(new ApiResponse(200, mapPeriod(period), "Payroll period cancelled successfully"));
});

export const listEmployeeBenefitAccruals = handle(async (req, res) => {
    const accruals = await payrollService.listEmployeeBenefitAccruals(req.user.prismaId, req.query.employee_id);
    return res.status(200).json(new ApiResponse(200, accruals.map(mapAccrual), "Benefit accruals fetched successfully"));
});

export const settleEmployeeBenefit = handle(async (req, res) => {
    const { employee_id, type, year, semester, cash_account_id } = req.body || {};
    if (!employee_id || !type || !year) {
        throw new ApiError(400, "employee_id, type and year are required");
    }
    const settlement = await payrollService.settleEmployeeBenefit({
        accountId: req.user.prismaId,
        employeeId: employee_id,
        type,
        year,
        semester,
        cashAccountId: cash_account_id,
    });
    return res.status(201).json(
        new ApiResponse(
            201,
            {
                _id: settlement.id,
                employee_id: settlement.employeeId,
                type: settlement.type,
                year: settlement.year,
                semester: settlement.semester,
                amount: Number(settlement.amount),
                payment_date: settlement.paymentDate,
            },
            "Benefit settled successfully"
        )
    );
});

export const listPayrollLegalParameters = handle(async (_req, res) => {
    const params = await payrollService.listPayrollLegalParameters();
    return res.status(200).json(
        new ApiResponse(
            200,
            params.map((p) => ({
                _id: p.id,
                year: p.year,
                smlmv: Number(p.smlmv),
                transport_allowance: Number(p.transportAllowance),
                uvt: Number(p.uvt),
                monthly_work_hours: Number(p.monthlyWorkHours),
                pension_solidarity_brackets: p.pensionSolidarityBrackets,
            })),
            "Payroll legal parameters fetched successfully"
        )
    );
});

export const upsertPayrollLegalParameters = handle(async (req, res) => {
    const { year, smlmv, transport_allowance, uvt, monthly_work_hours, pension_solidarity_brackets } = req.body || {};
    const params = await payrollService.upsertPayrollLegalParameters({
        year,
        smlmv,
        transportAllowance: transport_allowance,
        uvt,
        monthlyWorkHours: monthly_work_hours,
        pensionSolidarityBrackets: pension_solidarity_brackets,
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                _id: params.id,
                year: params.year,
                smlmv: Number(params.smlmv),
                transport_allowance: Number(params.transportAllowance),
                uvt: Number(params.uvt),
                monthly_work_hours: Number(params.monthlyWorkHours),
                pension_solidarity_brackets: params.pensionSolidarityBrackets,
            },
            "Payroll legal parameters saved successfully"
        )
    );
});

// Desprendible de pago (payslip) - a formal per-employee document, distinct
// from the eventual DIAN nómina electrónica XML (a later, separate phase).
// Reuses reportPdf.js's generic section/summary/table renderer instead of a
// bespoke layout, same as every other PDF this codebase generates.
export const getPayslipPdf = asyncHandler(async (req, res, next) => {
    try {
        const document = await prisma.payrollDocument.findFirst({
            where: { id: req.params.documentId },
            include: { employee: true, payrollPeriod: true, lines: true },
        });
        if (!document) return next(new ApiError(404, "Payroll document not found"));
        if (req.user.role !== "admin" && document.payrollPeriod.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to view this payslip"));
        }

        const account = await prisma.user.findUnique({
            where: { id: document.payrollPeriod.createdById },
            select: {
                username: true,
                company: { select: { name: true, legalName: true, taxIdentification: true, taxIdentificationDv: true } },
            },
        });
        const money = (value) =>
            new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
        const dateStr = (value) => new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });

        const employee = document.employee;
        const fullName = [employee.firstName, employee.secondName, employee.lastName, employee.secondLastName].filter(Boolean).join(" ");
        const earnings = document.lines.filter((l) => l.category === "earning");
        const deductions = document.lines.filter((l) => l.category === "deduction");

        streamReportPdf(res, {
            companyName: account?.company?.legalName || account?.company?.name,
            title: "Desprendible de pago",
            subtitle: `${fullName} · ${dateStr(document.payrollPeriod.startDate)} - ${dateStr(document.payrollPeriod.endDate)}`,
            generatedFor: account?.company?.name || account?.username,
            sections: [
                {
                    heading: "Información general",
                    summary: [
                        ["Empleado", fullName],
                        ["Documento", `${employee.documentType} ${employee.documentNumber}`],
                        ["Cargo", employee.position || "—"],
                        ["Días trabajados", String(document.workedDays)],
                        ["Salario base", money(document.baseSalarySnapshot)],
                    ],
                },
                {
                    heading: "Devengados",
                    table: {
                        headers: ["Concepto", "Valor"],
                        rows: earnings.length ? earnings.map((l) => [conceptLabel(l.conceptCode), money(l.amount)]) : [["Sin devengados", ""]],
                    },
                },
                {
                    heading: "Deducciones",
                    table: {
                        headers: ["Concepto", "Valor"],
                        rows: deductions.length ? deductions.map((l) => [conceptLabel(l.conceptCode), money(l.amount)]) : [["Sin deducciones", ""]],
                    },
                },
                {
                    heading: "Resumen",
                    summary: [
                        ["Total devengado", money(document.totalEarnings)],
                        ["Total deducciones", money(document.totalDeductions)],
                        ["Neto a pagar", money(document.netPay)],
                    ],
                },
            ],
        });
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

