import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    computeBasicEarning,
    computeTransportAllowanceEarning,
    computeIbc,
    computeDeductions,
    computeWithholdingTax,
    computeEmployerContributions,
    computeBenefitsBase,
    computeBenefitAccruals,
    daysInPeriod,
} from "../utils/payrollFormulas.js";
import {
    postPayrollJournalEntry,
    postPayrollPaymentJournalEntry,
    postBenefitSettlementJournalEntry,
    resolveLocationCostCenter,
} from "./accountingPosting.service.js";
import { recordCashMovement, claimCashAccount } from "./cashMovement.service.js";
import { emitAccountEvent } from "../live/dataEvents.js";

const round2 = (value) => Number(Number(value).toFixed(2));
const MS_PER_DAY = 86400000;

// The Employer-side "seguridad social / parafiscales / prestaciones
// sociales" line items only ever show up as employer_contribution lines -
// grouping them here once keeps postPayrollJournalEntry and the per-period
// totals aggregation (buildPeriodTotals below) from repeating the same
// concept -> bucket mapping.
const SOCIAL_SECURITY_EMPLOYER_CODES = ["health_employer", "pension_employer", "arl"];
const PARAFISCAL_CODES = ["sena", "icbf", "compensation_fund"];

const DOCUMENT_INCLUDE = {
    employee: true,
    lines: true,
};

const PERIOD_INCLUDE = {
    documents: { include: DOCUMENT_INCLUDE },
};

const getLegalParameters = async (year) => {
    const params = await prisma.payrollLegalParameter.findUnique({ where: { year } });
    if (!params) {
        throw new ApiError(
            400,
            `No hay parámetros legales de nómina configurados para el año ${year}. Un administrador debe agregar el SMLMV/UVT/auxilio de transporte de ese año primero.`,
            [],
            "",
            "payroll_legal_parameters_missing"
        );
    }
    return params;
};

// Prorates a period's nominal day count (30/15/7) against how much of it
// this specific employee was actually active for - a mid-period hire or
// termination gets less than the full period, everyone else gets the full
// nominal count. Calendar days are only used to compute the RATIO; the
// actual worked-days figure stored/used downstream stays on the 30-day-
// month convention every other formula in this module assumes.
const computeWorkedDays = ({ periodicity, startDate, endDate }, employee) => {
    const nominalDays = daysInPeriod(periodicity);
    const overlapStart = employee.hireDate > startDate ? employee.hireDate : startDate;
    const employeeEnd = employee.terminationDate ?? endDate;
    const overlapEnd = employeeEnd < endDate ? employeeEnd : endDate;
    if (overlapStart > overlapEnd) return 0;
    const overlapCalendarDays = Math.round((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
    const totalCalendarDays = Math.round((endDate - startDate) / MS_PER_DAY) + 1;
    return Math.min(nominalDays, round2((overlapCalendarDays / totalCalendarDays) * nominalDays));
};

export const createPayrollPeriod = async ({ accountId, periodicity, startDate, endDate, paymentDate, employeeIds }) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        throw new ApiError(400, "Invalid period dates");
    }
    if (!["monthly", "biweekly", "weekly"].includes(periodicity)) {
        throw new ApiError(400, "Invalid periodicity");
    }

    const employees = await prisma.employee.findMany({
        where: {
            createdById: accountId,
            status: "active",
            payFrequency: periodicity,
            ...(Array.isArray(employeeIds) && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
        },
    });
    if (employees.length === 0) {
        throw new ApiError(400, "No hay empleados activos que coincidan con esta periodicidad.", [], "", "payroll_no_matching_employees");
    }

    const period = await prisma.payrollPeriod.create({
        data: {
            periodicity,
            startDate: start,
            endDate: end,
            paymentDate: paymentDate ? new Date(paymentDate) : null,
            createdById: accountId,
            updatedById: accountId,
            documents: {
                create: employees.map((employee) => ({
                    employeeId: employee.id,
                    workedDays: computeWorkedDays({ periodicity, startDate: start, endDate: end }, employee),
                    baseSalarySnapshot: employee.baseSalary,
                })),
            },
        },
        include: PERIOD_INCLUDE,
    });

    emitAccountEvent(accountId, "payrollPeriod", "created");
    return period;
};

export const listPayrollPeriods = (accountId) =>
    prisma.payrollPeriod.findMany({
        where: { createdById: accountId },
        include: { documents: { select: { id: true, netPay: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
    });

export const getPayrollPeriod = async (accountId, id) => {
    const period = await prisma.payrollPeriod.findFirst({
        where: { id, createdById: accountId },
        include: {
            documents: {
                include: { employee: true, lines: true },
                orderBy: { createdAt: "asc" },
            },
        },
    });
    if (!period) throw new ApiError(404, "Payroll period not found");
    return period;
};

// Only allowed while the document's period hasn't been approved yet -
// mirrors every other "edit a draft before it's committed" guard in this
// codebase. The period must be recalculated afterward for the new value to
// actually take effect on its lines/totals.
export const updateDocumentWorkedDays = async ({ accountId, documentId, workedDays }) => {
    const qty = Number(workedDays);
    if (!Number.isFinite(qty) || qty < 0) throw new ApiError(400, "workedDays must be a non-negative number");

    const document = await prisma.payrollDocument.findFirst({
        where: { id: documentId },
        include: { payrollPeriod: true },
    });
    if (!document || document.payrollPeriod.createdById !== accountId) {
        throw new ApiError(404, "Payroll document not found");
    }
    if (!["draft", "calculated"].includes(document.payrollPeriod.status)) {
        throw new ApiError(400, "This payroll period is no longer editable.", [], "", "invalid_payroll_status_transition");
    }

    return prisma.payrollDocument.update({ where: { id: document.id }, data: { workedDays: qty } });
};

// The pure calculation for one employee/document - returns the line items
// (unsaved) plus the totals PayrollDocument itself stores. Never mutates
// EmployeeBenefitAccrual (that only happens once, at approval - see
// approvePayrollPeriod) - `priorSeveranceBalance` is read fresh each call so
// recalculating a still-draft period is always safe to repeat.
const calculateDocumentLines = ({ employee, workedDays, legalParams, companyExonerated, priorSeveranceBalance }) => {
    const smlmv = Number(legalParams.smlmv);
    const baseSalary = Number(employee.baseSalary);
    const isIntegral = employee.isIntegralSalary;

    const lines = [];
    const push = (category, conceptCode, amount, extra = {}) => {
        if (Math.abs(amount) < 0.005) return;
        lines.push({ category, conceptCode, amount: round2(amount), ...extra });
    };

    const basic = computeBasicEarning({ baseSalary, workedDays });
    push("earning", "basic_salary", basic);

    const transport = computeTransportAllowanceEarning({ baseSalary, isIntegralSalary: isIntegral, smlmv, transportAllowance: legalParams.transportAllowance, workedDays });
    push("earning", "transport_allowance", transport);

    const salarialEarnings = basic; // extend here once hourly/overtime input exists on the document

    const ibc = computeIbc({ salarialEarnings, isIntegralSalary: isIntegral, smlmv });
    const deductions = computeDeductions({ ibc, smlmv, pensionSolidarityBrackets: legalParams.pensionSolidarityBrackets });
    push("deduction", "health_employee", deductions.health);
    push("deduction", "pension_employee", deductions.pension);
    push("deduction", "pension_solidarity_fund", deductions.pensionSolidarityFund);

    const withholding = computeWithholdingTax({
        taxableMonthlyEarnings: salarialEarnings,
        healthEmployee: deductions.health,
        pensionEmployee: deductions.pension,
        uvt: legalParams.uvt,
    });
    push("deduction", "withholding_tax", withholding);

    const employer = computeEmployerContributions({ ibc, baseSalary, smlmv, riskLevel: employee.riskLevel, companyExonerated });
    push("employer_contribution", "health_employer", employer.health);
    push("employer_contribution", "pension_employer", employer.pension);
    push("employer_contribution", "arl", employer.arl);
    push("employer_contribution", "sena", employer.sena);
    push("employer_contribution", "icbf", employer.icbf);
    push("employer_contribution", "compensation_fund", employer.compensationFund);

    // Salario integral already bundles prestaciones sociales into the
    // agreed pay (CST art. 132) - no separate provision for it here, see
    // Employee.isIntegralSalary's schema comment.
    if (!isIntegral) {
        const benefitsBase = computeBenefitsBase({ salarialEarnings, transportAllowanceEarning: transport });
        const accruals = computeBenefitAccruals({ benefitsBase, baseSalary, workedDays, priorSeveranceBalance });
        push("employer_contribution", "severance_employer", accruals.severance);
        push("employer_contribution", "severance_interest_employer", accruals.severanceInterest);
        push("employer_contribution", "service_bonus_employer", accruals.serviceBonus);
        push("employer_contribution", "vacation_provision", accruals.vacationProvision, { quantity: accruals.vacationDays });
    }

    const totalEarnings = round2(lines.filter((l) => l.category === "earning").reduce((s, l) => s + l.amount, 0));
    const totalDeductions = round2(lines.filter((l) => l.category === "deduction").reduce((s, l) => s + l.amount, 0));
    const totalEmployerContributions = round2(lines.filter((l) => l.category === "employer_contribution").reduce((s, l) => s + l.amount, 0));
    const netPay = round2(totalEarnings - totalDeductions);

    return { lines, totalEarnings, totalDeductions, totalEmployerContributions, netPay };
};

// draft/calculated -> calculated: (re)computes every document's lines from
// scratch. Safe to call repeatedly before approval - nothing here writes
// to EmployeeBenefitAccrual or accounting, only to this period's own
// documents/lines.
export const calculatePayrollPeriod = async ({ accountId, periodId }) => {
    const period = await prisma.payrollPeriod.findFirst({
        where: { id: periodId, createdById: accountId },
        include: { documents: { include: { employee: true } } },
    });
    if (!period) throw new ApiError(404, "Payroll period not found");
    if (!["draft", "calculated"].includes(period.status)) {
        throw new ApiError(400, `No se puede calcular un período en estado "${period.status}".`, [], "", "invalid_payroll_status_transition");
    }

    const year = period.startDate.getFullYear();
    const legalParams = await getLegalParameters(year);
    const owner = await prisma.user.findUnique({
        where: { id: accountId },
        select: { company: { select: { payrollAportesExonerados: true } } },
    });
    const companyExonerated = owner?.company?.payrollAportesExonerados === true;

    await prisma.$transaction(async (tx) => {
        for (const document of period.documents) {
            const priorAccrual = await tx.employeeBenefitAccrual.findUnique({
                where: { employeeId_year_semester_type: { employeeId: document.employeeId, year, semester: null, type: "severance" } },
                select: { accruedAmount: true },
            });
            const result = calculateDocumentLines({
                employee: document.employee,
                workedDays: Number(document.workedDays),
                legalParams,
                companyExonerated,
                priorSeveranceBalance: Number(priorAccrual?.accruedAmount ?? 0),
            });

            await tx.payrollDocumentLine.deleteMany({ where: { payrollDocumentId: document.id } });
            await tx.payrollDocumentLine.createMany({
                data: result.lines.map((line) => ({ ...line, payrollDocumentId: document.id })),
            });
            await tx.payrollDocument.update({
                where: { id: document.id },
                data: {
                    status: "calculated",
                    totalEarnings: result.totalEarnings,
                    totalDeductions: result.totalDeductions,
                    totalEmployerContributions: result.totalEmployerContributions,
                    netPay: result.netPay,
                },
            });
        }
        await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "calculated", calculatedAt: new Date() } });
    });

    emitAccountEvent(accountId, "payrollPeriod", "calculated");
    return getPayrollPeriod(accountId, periodId);
};

// Sums every document's lines in the period into the buckets
// postPayrollJournalEntry needs - see that function's own comment for why
// employee + employer social-security contributions share one bucket.
const buildPeriodTotals = (documents) => {
    const totals = {
        grossEarnings: 0,
        employeeSocialSecurity: 0,
        withholdingTax: 0,
        netPay: 0,
        employerSocialSecurity: 0,
        employerParafiscal: 0,
        severanceProvision: 0,
        severanceInterestProvision: 0,
        serviceBonusProvision: 0,
        vacationProvision: 0,
    };
    for (const document of documents) {
        totals.netPay += Number(document.netPay);
        for (const line of document.lines) {
            const amount = Number(line.amount);
            if (line.category === "earning") totals.grossEarnings += amount;
            else if (line.category === "deduction") {
                if (line.conceptCode === "withholding_tax") totals.withholdingTax += amount;
                else totals.employeeSocialSecurity += amount;
            } else if (line.category === "employer_contribution") {
                if (SOCIAL_SECURITY_EMPLOYER_CODES.includes(line.conceptCode)) totals.employerSocialSecurity += amount;
                else if (PARAFISCAL_CODES.includes(line.conceptCode)) totals.employerParafiscal += amount;
                else if (line.conceptCode === "severance_employer") totals.severanceProvision += amount;
                else if (line.conceptCode === "severance_interest_employer") totals.severanceInterestProvision += amount;
                else if (line.conceptCode === "service_bonus_employer") totals.serviceBonusProvision += amount;
                else if (line.conceptCode === "vacation_provision") totals.vacationProvision += amount;
            }
        }
    }
    return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)]));
};

const semesterOf = (date) => (date.getMonth() < 6 ? 1 : 2);

// calculated -> approved: locks in this period's numbers. From here on the
// only way to change a document's pay is a new period (or, eventually, a
// manual adjustment out of this phase's scope) - approval is the same
// "nothing touches accounting/accruals before this point" commit line
// purchases/orders/production orders already use for their own
// pending -> completed transition.
export const approvePayrollPeriod = async ({ accountId, periodId }) => {
    const period = await getPayrollPeriod(accountId, periodId);
    if (period.status !== "calculated") {
        throw new ApiError(400, `No se puede aprobar un período en estado "${period.status}". Calcúlalo primero.`, [], "", "invalid_payroll_status_transition");
    }

    const year = period.startDate.getFullYear();
    const semester = semesterOf(period.startDate);

    const updated = await prisma.$transaction(async (tx) => {
        const claim = await tx.payrollPeriod.updateMany({
            where: { id: period.id, status: "calculated" },
            data: { status: "approved", approvedAt: new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este período ya fue actualizado por otra solicitud. Actualiza e intenta de nuevo.");
        }

        for (const document of period.documents) {
            await tx.payrollDocument.update({ where: { id: document.id }, data: { status: "approved" } });

            const accrue = async (type, amount, semesterValue) => {
                if (amount <= 0) return;
                await tx.employeeBenefitAccrual.upsert({
                    where: { employeeId_year_semester_type: { employeeId: document.employeeId, year, semester: semesterValue, type } },
                    update: { accruedAmount: { increment: amount } },
                    create: { employeeId: document.employeeId, year, semester: semesterValue, type, accruedAmount: amount },
                });
            };

            for (const line of document.lines) {
                if (line.conceptCode === "severance_employer") await accrue("severance", Number(line.amount), null);
                if (line.conceptCode === "severance_interest_employer") await accrue("severance_interest", Number(line.amount), null);
                if (line.conceptCode === "service_bonus_employer") await accrue("service_bonus", Number(line.amount), semester);
                if (line.conceptCode === "vacation_provision") {
                    await tx.employeeBenefitAccrual.upsert({
                        where: { employeeId_year_semester_type: { employeeId: document.employeeId, year, semester: null, type: "vacation" } },
                        update: { accruedDays: { increment: Number(line.quantity || 0) }, accruedAmount: { increment: Number(line.amount) } },
                        create: { employeeId: document.employeeId, year, semester: null, type: "vacation", accruedDays: Number(line.quantity || 0), accruedAmount: Number(line.amount) },
                    });
                }
            }
        }

        // Cost-center tagging only makes sense when every employee in this
        // period works at the same location - a mixed-location period's
        // entry is posted untagged rather than misattributed to whichever
        // employee happened to be read first.
        const locationIds = new Set(period.documents.map((d) => d.employee.pointOfSaleId).filter(Boolean));
        const costCenterId = locationIds.size === 1 ? await resolveLocationCostCenter(tx, accountId, [...locationIds][0]) : null;

        await postPayrollJournalEntry(tx, {
            accountId,
            createdById: accountId,
            period,
            totals: buildPeriodTotals(period.documents),
            costCenterId,
        });

        return tx.payrollPeriod.findUniqueOrThrow({ where: { id: period.id }, include: PERIOD_INCLUDE });
    });

    emitAccountEvent(accountId, "payrollPeriod", "approved");
    return updated;
};

// approved -> paid: settles net pay + this period's own aportes against a
// cash account in one entry - see postPayrollPaymentJournalEntry's own
// comment for why the four prestaciones sociales provisions are NOT
// touched here.
export const payPayrollPeriod = async ({ accountId, periodId, cashAccountId, paymentDate }) => {
    const period = await getPayrollPeriod(accountId, periodId);
    if (period.status !== "approved") {
        throw new ApiError(400, `No se puede pagar un período en estado "${period.status}". Apruébalo primero.`, [], "", "invalid_payroll_status_transition");
    }

    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "payroll_cash_account_not_found");

    const totals = buildPeriodTotals(period.documents);
    const totalToPay = round2(totals.netPay + totals.employeeSocialSecurity + totals.employerSocialSecurity + totals.employerParafiscal + totals.withholdingTax);

    const updated = await prisma.$transaction(async (tx) => {
        const claim = await tx.payrollPeriod.updateMany({
            where: { id: period.id, status: "approved" },
            data: { status: "paid", paidAt: new Date(), paymentDate: paymentDate ? new Date(paymentDate) : new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este período ya fue actualizado por otra solicitud. Actualiza e intenta de nuevo.");
        }
        await tx.payrollDocument.updateMany({ where: { payrollPeriodId: period.id }, data: { status: "paid" } });

        if (totalToPay > 0) {
            const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: totalToPay });
            if (balanceAfter === null) {
                throw new ApiError(422, "Saldo insuficiente en la cuenta de efectivo seleccionada.", [], "", "insufficient_cash_balance");
            }
            await recordCashMovement(tx, {
                cashAccountId: cashAccount.id,
                delta: -totalToPay,
                balanceAfter,
                sourceType: "payroll_payment",
                sourceId: period.id,
                createdById: accountId,
            });
        }

        const locationIds = new Set(period.documents.map((d) => d.employee.pointOfSaleId).filter(Boolean));
        const costCenterId = locationIds.size === 1 ? await resolveLocationCostCenter(tx, accountId, [...locationIds][0]) : null;

        await postPayrollPaymentJournalEntry(tx, { accountId, createdById: accountId, period, totals, cashAccount, costCenterId });

        return tx.payrollPeriod.findUniqueOrThrow({ where: { id: period.id }, include: PERIOD_INCLUDE });
    });

    emitAccountEvent(accountId, "payrollPeriod", "paid");
    return updated;
};

// draft/calculated only - nothing has touched accounting or accruals yet at
// those two statuses, so cancelling is a pure status flip. An
// approved/paid period has already posted real journal entries and (for
// approved+) incremented benefit accruals - reversing that safely is out
// of this phase's scope, same "no full reversal yet" limitation the
// session's earlier phases (fixed assets, etc.) already carry.
export const cancelPayrollPeriod = async ({ accountId, periodId }) => {
    const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, createdById: accountId } });
    if (!period) throw new ApiError(404, "Payroll period not found");
    if (!["draft", "calculated"].includes(period.status)) {
        throw new ApiError(400, `No se puede cancelar un período en estado "${period.status}".`, [], "", "invalid_payroll_status_transition");
    }

    await prisma.$transaction(async (tx) => {
        const claim = await tx.payrollPeriod.updateMany({
            where: { id: period.id, status: period.status },
            data: { status: "cancelled", cancelledAt: new Date() },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este período ya fue actualizado por otra solicitud. Actualiza e intenta de nuevo.");
        }
        await tx.payrollDocument.updateMany({ where: { payrollPeriodId: period.id }, data: { status: "cancelled" } });
    });

    emitAccountEvent(accountId, "payrollPeriod", "cancelled");
    return prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period.id }, include: PERIOD_INCLUDE });
};

// Phase 6 - prestaciones sociales settlement (prima de junio/diciembre,
// cesantías anuales antes del 14 de febrero). Pays out whatever's still
// pending on the accrual (accruedAmount - settledAmount already paid by
// earlier settlements), never more than that even if the caller asks for
// more, and records the audit-trail row + accounting entry in one
// transaction.
export const settleEmployeeBenefit = async ({ accountId, employeeId, type, year, semester, cashAccountId }) => {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, createdById: accountId } });
    if (!employee) throw new ApiError(404, "Employee not found");

    const accrual = await prisma.employeeBenefitAccrual.findUnique({
        where: { employeeId_year_semester_type: { employeeId, year: Number(year), semester: semester ? Number(semester) : null, type } },
    });
    const pending = round2(Number(accrual?.accruedAmount ?? 0) - Number(accrual?.settledAmount ?? 0));
    if (pending <= 0) {
        throw new ApiError(400, "No hay saldo pendiente para liquidar.", [], "", "payroll_no_pending_benefit_balance");
    }

    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "payroll_cash_account_not_found");

    const settlement = await prisma.$transaction(async (tx) => {
        const created = await tx.payrollBenefitSettlement.create({
            data: { employeeId, type, year: Number(year), semester: semester ? Number(semester) : null, amount: pending, createdById: accountId },
        });
        await tx.employeeBenefitAccrual.update({ where: { id: accrual.id }, data: { settledAmount: { increment: pending } } });

        const balanceAfter = await claimCashAccount(tx, { cashAccountId: cashAccount.id, amount: pending });
        if (balanceAfter === null) {
            throw new ApiError(422, "Saldo insuficiente en la cuenta de efectivo seleccionada.", [], "", "insufficient_cash_balance");
        }
        await recordCashMovement(tx, {
            cashAccountId: cashAccount.id,
            delta: -pending,
            balanceAfter,
            sourceType: "payroll_benefit_settlement",
            sourceId: created.id,
            createdById: accountId,
        });

        await postBenefitSettlementJournalEntry(tx, { accountId, createdById: accountId, settlement: created, cashAccount });

        return created;
    });

    emitAccountEvent(accountId, "employeeBenefitAccrual", "settled");
    return settlement;
};

export const listEmployeeBenefitAccruals = (accountId, employeeId) =>
    prisma.employeeBenefitAccrual.findMany({
        where: { employee: { createdById: accountId }, ...(employeeId ? { employeeId } : {}) },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ year: "desc" }, { semester: "desc" }],
    });

// PayrollLegalParameter is a platform-wide table (see its schema comment) -
// no accountId scoping on read or write, admin-only on write (enforced at
// the route layer).
export const listPayrollLegalParameters = () => prisma.payrollLegalParameter.findMany({ orderBy: { year: "desc" } });

export const upsertPayrollLegalParameters = ({ year, smlmv, transportAllowance, uvt, monthlyWorkHours, pensionSolidarityBrackets }) => {
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000) throw new ApiError(400, "Invalid year");
    for (const [label, value] of [["smlmv", smlmv], ["transportAllowance", transportAllowance], ["uvt", uvt]]) {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new ApiError(400, `${label} must be a positive number`);
    }
    if (!Array.isArray(pensionSolidarityBrackets)) throw new ApiError(400, "pensionSolidarityBrackets must be an array");

    return prisma.payrollLegalParameter.upsert({
        where: { year: yearNum },
        update: {
            smlmv: Number(smlmv),
            transportAllowance: Number(transportAllowance),
            uvt: Number(uvt),
            ...(monthlyWorkHours !== undefined && { monthlyWorkHours: Number(monthlyWorkHours) }),
            pensionSolidarityBrackets,
        },
        create: {
            year: yearNum,
            smlmv: Number(smlmv),
            transportAllowance: Number(transportAllowance),
            uvt: Number(uvt),
            monthlyWorkHours: monthlyWorkHours !== undefined ? Number(monthlyWorkHours) : 240,
            pensionSolidarityBrackets,
        },
    });
};
