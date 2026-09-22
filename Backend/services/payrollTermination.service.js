import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { streamReportPdf } from "../utils/reportPdf.js";
import { dailyRate, computeIndefiniteTermIndemnityDays, computeFixedTermIndemnityAmount } from "../utils/payrollFormulas.js";
import { getLegalParameters, createBenefitSettlementRecord } from "./payroll.service.js";
import { postTerminationSettlementJournalEntry } from "./accountingPosting.service.js";
import { recordCashMovement, claimCashAccount } from "./cashMovement.service.js";
import { emitAccountEvent } from "../live/dataEvents.js";

// "Liquidación definitiva" - NOT a certified legal filing. CST art. 64
// (modificado por Ley 789/2002 art. 28) indemnización formulas are hardcoded
// here (unlike renta/RST rates, this law has been stable since 2002 - see
// payrollFormulas.js's own comment), but this deliberately does NOT model
// fuero (embarazo, sindical, discapacidad - cases requiring reintegro, not
// indemnización) or preaviso de contrato a término fijo. Always reviewed by
// a labor lawyer/accountant before relying on it - same posture as every
// other legal calculation in this codebase.

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const MS_PER_DAY = 86400000;
const TERMINATION_REASONS = ["resignation", "just_cause", "without_just_cause", "contract_expiration", "mutual_agreement"];
const PENDING_ACCRUAL_TYPES = ["severance", "severance_interest", "service_bonus", "vacation"];

const fullName = (employee) => [employee.firstName, employee.secondName, employee.lastName, employee.secondLastName].filter(Boolean).join(" ");

const validateInputs = async ({ accountId, employeeId, terminationDate, terminationReason }) => {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, createdById: accountId } });
    if (!employee) throw new ApiError(404, "Employee not found");
    if (!TERMINATION_REASONS.includes(terminationReason)) {
        throw new ApiError(400, "terminationReason is invalid.", [], "", "payroll_termination_reason_invalid");
    }
    const date = new Date(terminationDate);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "terminationDate is invalid.", [], "", "payroll_termination_date_invalid");
    if (date < employee.hireDate) {
        throw new ApiError(400, "La fecha de terminación no puede ser anterior a la fecha de contratación.", [], "", "payroll_termination_date_before_hire");
    }
    const existing = await prisma.payrollTerminationSettlement.findUnique({ where: { employeeId } });
    return { employee, date, existing };
};

// Sums every EmployeeBenefitAccrual bucket with a pending balance (ALL
// years/semesters, not one - unlike payroll.service.js#settleEmployeeBenefit
// which drains exactly one caller-chosen bucket) plus, when applicable,
// indemnización. Read-only - previewTerminationSettlement calls this
// directly; settleTermination recomputes the same thing inside its
// transaction so nothing can drift between what was shown and what's paid.
const computeBreakdown = async ({ employee, terminationDate, terminationReason, remainingWorkDays, manualIndemnityOverride }) => {
    const accruals = await prisma.employeeBenefitAccrual.findMany({
        where: { employeeId: employee.id, type: { in: PENDING_ACCRUAL_TYPES } },
    });
    const pendingByAccrual = accruals
        .map((accrual) => ({ accrual, pending: round2(Number(accrual.accruedAmount) - Number(accrual.settledAmount)) }))
        .filter((row) => row.pending > 0);
    const sumByType = (type) => round2(pendingByAccrual.filter((row) => row.accrual.type === type).reduce((sum, row) => sum + row.pending, 0));

    const severanceAmount = sumByType("severance");
    const severanceInterestAmount = sumByType("severance_interest");
    const serviceBonusAmount = sumByType("service_bonus");
    const vacationAmount = sumByType("vacation");

    let indemnityAmount = 0;
    let indemnityDays = null;
    const hasManualOverride = manualIndemnityOverride !== undefined && manualIndemnityOverride !== null && manualIndemnityOverride !== "";
    if (hasManualOverride) {
        indemnityAmount = round2(manualIndemnityOverride);
    } else if (terminationReason === "without_just_cause") {
        const legalParams = await getLegalParameters(terminationDate.getFullYear());
        const daysServed = Math.round((terminationDate - employee.hireDate) / MS_PER_DAY) + 1;
        const yearsOfService = round2(daysServed / 360);

        if (employee.contractType === "indefinido") {
            indemnityDays = computeIndefiniteTermIndemnityDays({ yearsOfService, baseSalary: employee.baseSalary, smlmv: legalParams.smlmv });
            indemnityAmount = round2(dailyRate(employee.baseSalary) * indemnityDays);
        } else if (employee.contractType === "fijo") {
            if (!employee.contractEndDate) {
                throw new ApiError(400, "Este empleado tiene contrato a término fijo pero no tiene fecha de fin de contrato configurada.", [], "", "payroll_termination_contract_end_date_missing");
            }
            const remaining = Math.max(Math.round((employee.contractEndDate - terminationDate) / MS_PER_DAY), 0);
            indemnityAmount = computeFixedTermIndemnityAmount({ dailySalary: dailyRate(employee.baseSalary), remainingDays: remaining });
            indemnityDays = Math.max(remaining, 15);
        } else if (employee.contractType === "obra_labor") {
            const remaining = Number(remainingWorkDays) || 0;
            indemnityAmount = computeFixedTermIndemnityAmount({ dailySalary: dailyRate(employee.baseSalary), remainingDays: remaining });
            indemnityDays = Math.max(remaining, 15);
        }
        // aprendizaje: no formulaic indemnización modeled - stays 0 unless a
        // manual override was supplied above.
    }

    const totalAmount = round2(severanceAmount + severanceInterestAmount + serviceBonusAmount + vacationAmount + indemnityAmount);
    return { pendingByAccrual, severanceAmount, severanceInterestAmount, serviceBonusAmount, vacationAmount, indemnityAmount, indemnityDays, totalAmount };
};

export const previewTerminationSettlement = async ({ accountId, employeeId, terminationDate, terminationReason, remainingWorkDays, manualIndemnityOverride }) => {
    const { employee, date, existing } = await validateInputs({ accountId, employeeId, terminationDate, terminationReason });
    if (existing) return { configured: false, already_settled: true, employee_id: employeeId };

    const breakdown = await computeBreakdown({ employee, terminationDate: date, terminationReason, remainingWorkDays, manualIndemnityOverride });
    return {
        configured: true,
        already_settled: false,
        employee: { id: employee.id, name: fullName(employee), contract_type: employee.contractType, contract_end_date: employee.contractEndDate },
        termination_date: date,
        termination_reason: terminationReason,
        base_salary: Number(employee.baseSalary),
        severance_amount: breakdown.severanceAmount,
        severance_interest_amount: breakdown.severanceInterestAmount,
        service_bonus_amount: breakdown.serviceBonusAmount,
        vacation_amount: breakdown.vacationAmount,
        indemnity_amount: breakdown.indemnityAmount,
        indemnity_days: breakdown.indemnityDays,
        total_amount: breakdown.totalAmount,
    };
};

export const settleTermination = async ({ accountId, employeeId, terminationDate, terminationReason, remainingWorkDays, manualIndemnityOverride, cashAccountId }) => {
    const { employee, date, existing } = await validateInputs({ accountId, employeeId, terminationDate, terminationReason });
    if (existing) throw new ApiError(400, "Este empleado ya tiene una liquidación registrada.", [], "", "payroll_termination_already_settled");

    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "payroll_cash_account_not_found");

    const breakdown = await computeBreakdown({ employee, terminationDate: date, terminationReason, remainingWorkDays, manualIndemnityOverride });
    if (breakdown.totalAmount <= 0) {
        throw new ApiError(400, "No hay ningún valor que liquidar para este empleado.", [], "", "payroll_termination_nothing_to_settle");
    }

    const settlement = await prisma.$transaction(async (tx) => {
        for (const { accrual, pending } of breakdown.pendingByAccrual) {
            await createBenefitSettlementRecord(tx, { accrual, pending, createdById: accountId });
        }

        const created = await tx.payrollTerminationSettlement.create({
            data: {
                employeeId,
                terminationDate: date,
                terminationReason,
                baseSalarySnapshot: employee.baseSalary,
                severanceAmount: breakdown.severanceAmount,
                severanceInterestAmount: breakdown.severanceInterestAmount,
                serviceBonusAmount: breakdown.serviceBonusAmount,
                vacationAmount: breakdown.vacationAmount,
                indemnityAmount: breakdown.indemnityAmount,
                indemnityDays: breakdown.indemnityDays,
                totalAmount: breakdown.totalAmount,
                cashAccountId: cashAccount.id,
                createdById: accountId,
            },
        });

        await tx.employee.update({ where: { id: employeeId }, data: { status: "terminated", terminationDate: date, terminationReason } });

        const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: breakdown.totalAmount });
        if (balanceAfter === null) {
            throw new ApiError(422, "Saldo insuficiente en la cuenta de efectivo seleccionada.", [], "", "insufficient_cash_balance");
        }
        await recordCashMovement(tx, {
            cashAccountId: cashAccount.id,
            delta: -breakdown.totalAmount,
            balanceAfter,
            sourceType: "payroll_termination_settlement",
            sourceId: created.id,
            createdById: accountId,
        });

        await postTerminationSettlementJournalEntry(tx, { accountId, createdById: accountId, settlement: created, employeeName: fullName(employee), cashAccount });

        return created;
    });

    emitAccountEvent(accountId, "employee", "updated");
    emitAccountEvent(accountId, "employeeBenefitAccrual", "settled");
    return settlement;
};

export const getTerminationSettlement = async (accountId, employeeId) => {
    const settlement = await prisma.payrollTerminationSettlement.findFirst({
        where: { employeeId, employee: { createdById: accountId } },
        include: { employee: true },
    });
    if (!settlement) throw new ApiError(404, "Termination settlement not found");
    return settlement;
};

const TERMINATION_REASON_LABELS = {
    resignation: "Renuncia voluntaria",
    just_cause: "Despido con justa causa",
    without_just_cause: "Despido sin justa causa",
    contract_expiration: "Vencimiento del plazo pactado",
    mutual_agreement: "Mutuo acuerdo",
};

export const renderTerminationSettlementPdf = (res, settlement, companyName) => {
    const employee = settlement.employee;
    const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
    const dateStr = (value) => new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
    const name = fullName(employee);

    streamReportPdf(res, {
        companyName,
        title: "Acta de liquidación definitiva",
        subtitle: `${name} · Terminación: ${dateStr(settlement.terminationDate)}`,
        sections: [
            {
                heading: "Información general",
                summary: [
                    ["Empleado", name],
                    ["Documento", `${employee.documentType} ${employee.documentNumber}`],
                    ["Fecha de ingreso", dateStr(employee.hireDate)],
                    ["Fecha de terminación", dateStr(settlement.terminationDate)],
                    ["Motivo", TERMINATION_REASON_LABELS[settlement.terminationReason] || settlement.terminationReason],
                    ["Salario base", money(settlement.baseSalarySnapshot)],
                ],
            },
            {
                heading: "Desglose de la liquidación",
                table: {
                    headers: ["Concepto", "Valor"],
                    rows: [
                        ["Cesantías pendientes", money(settlement.severanceAmount)],
                        ["Intereses a las cesantías pendientes", money(settlement.severanceInterestAmount)],
                        ["Prima de servicios proporcional pendiente", money(settlement.serviceBonusAmount)],
                        ["Vacaciones pendientes", money(settlement.vacationAmount)],
                        [settlement.indemnityDays ? `Indemnización (${settlement.indemnityDays} días)` : "Indemnización", money(settlement.indemnityAmount)],
                    ],
                },
            },
            {
                heading: "Total",
                summary: [["Total liquidación", money(settlement.totalAmount)]],
            },
        ],
    });
};
