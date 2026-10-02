import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { isForeignKeyRestrictError } from "../utils/prismaErrors.js";
import { emitAccountEvent } from "../live/dataEvents.js";
import { updateWithConflictCheck, parseExpectedUpdatedAt } from "../utils/optimisticConcurrency.js";
import { assertLinkableUser, listLinkableUsers } from "../services/employeeLink.service.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const CONTRACT_TYPES = ["indefinido", "fijo", "obra_labor", "aprendizaje"];
const WORKER_TYPES = ["normal", "pensionado", "aprendiz", "alto_riesgo"];
const PAY_FREQUENCIES = ["monthly", "biweekly", "weekly"];
const RISK_LEVELS = ["I", "II", "III", "IV", "V"];
const STATUSES = ["active", "inactive", "terminated"];

const EMPLOYEE_INCLUDE = { pointOfSale: { select: { id: true, name: true } }, user: { select: { id: true, username: true, email: true } } };

// "" / null unlinks; anything else must be one of the account's own people.
const resolveUserLink = async (accountId, value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    await assertLinkableUser(accountId, String(value));
    return String(value);
};

const linkConflict = () => new ApiError(409, "Ese usuario ya está vinculado a otro empleado.", [], "", "employee_user_taken");

const mapEmployee = (employee, currentUser) => ({
    _id: toExternalId(employee),
    document_type: employee.documentType,
    document_number: employee.documentNumber,
    first_name: employee.firstName,
    second_name: employee.secondName,
    last_name: employee.lastName,
    second_last_name: employee.secondLastName,
    full_name: [employee.firstName, employee.secondName, employee.lastName, employee.secondLastName].filter(Boolean).join(" "),
    email: employee.email,
    phone: employee.phone,
    address: employee.address,
    hire_date: employee.hireDate,
    termination_date: employee.terminationDate,
    termination_reason: employee.terminationReason,
    // Only meaningful for contract_type = fijo - see the schema comment on
    // Employee.contractEndDate and payrollTermination.service.js, which
    // needs it to compute indemnización for an early termination.
    contract_end_date: employee.contractEndDate,
    contract_type: employee.contractType,
    worker_type: employee.workerType,
    pay_frequency: employee.payFrequency,
    base_salary: Number(employee.baseSalary),
    is_integral_salary: employee.isIntegralSalary,
    risk_level: employee.riskLevel,
    position: employee.position,
    eps: employee.eps,
    pension_fund: employee.pensionFund,
    severance_fund: employee.severanceFund,
    compensation_fund: employee.compensationFund,
    bank_name: employee.bankName,
    bank_account_type: employee.bankAccountType,
    bank_account_number: employee.bankAccountNumber,
    work_city: employee.workCity,
    point_of_sale_id: employee.pointOfSale ? { _id: employee.pointOfSale.id, name: employee.pointOfSale.name } : null,
    // Their Ohnix login, if linked (see employeeLink.service.js).
    user: employee.user ? { _id: employee.user.id, username: employee.user.username, email: employee.user.email } : null,
    status: employee.status,
    canEdit: currentUser ? currentUser.role === "admin" || employee.createdById === currentUser.prismaId : false,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
});

// Employee is a brand-new entity (no legacy Mongo migration), so this is a
// plain id lookup - no "any id" OR needed, unlike most other entities in
// this codebase.
const findEmployeeByAnyId = async (id) =>
    prisma.employee.findUnique({
        where: { id },
        include: EMPLOYEE_INCLUDE,
    });

const validateEnum = (value, allowed, fieldName) => {
    if (value !== undefined && value !== null && value !== "" && !allowed.includes(value)) {
        throw new ApiError(400, `${fieldName} must be one of: ${allowed.join(", ")}`);
    }
};

const createEmployee = asyncHandler(async (req, res, next) => {
    const {
        document_type,
        document_number,
        first_name,
        second_name,
        last_name,
        second_last_name,
        email,
        phone,
        address,
        hire_date,
        contract_type,
        worker_type,
        pay_frequency,
        base_salary,
        is_integral_salary,
        risk_level,
        position,
        eps,
        pension_fund,
        severance_fund,
        compensation_fund,
        bank_name,
        bank_account_type,
        bank_account_number,
        work_city,
        point_of_sale_id,
        user_id,
    } = req.body || {};

    if (!document_number || !first_name || !last_name || !hire_date || base_salary === undefined) {
        return next(new ApiError(400, "document_number, first_name, last_name, hire_date and base_salary are required"));
    }

    const baseSalaryNum = Number(base_salary);
    if (!Number.isFinite(baseSalaryNum) || baseSalaryNum <= 0) {
        return next(new ApiError(400, "base_salary must be a positive number"));
    }

    const hireDate = new Date(hire_date);
    if (Number.isNaN(hireDate.getTime())) {
        return next(new ApiError(400, "Invalid hire_date"));
    }

    try {
        validateEnum(contract_type, CONTRACT_TYPES, "contract_type");
        validateEnum(worker_type, WORKER_TYPES, "worker_type");
        validateEnum(pay_frequency, PAY_FREQUENCIES, "pay_frequency");
        validateEnum(risk_level, RISK_LEVELS, "risk_level");

        const existing = await prisma.employee.findFirst({
            where: { createdById: req.user.prismaId, documentNumber: String(document_number).trim() },
            select: { id: true },
        });
        if (existing) {
            return next(new ApiError(409, "An employee with this document number already exists", [], "", "employee_document_exists"));
        }
        const userId = await resolveUserLink(req.user.prismaId, user_id);

        const employee = await prisma.employee.create({
            data: {
                documentType: document_type?.trim() || "CC",
                documentNumber: String(document_number).trim(),
                firstName: first_name.trim(),
                secondName: second_name?.trim() || null,
                lastName: last_name.trim(),
                secondLastName: second_last_name?.trim() || null,
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                address: address?.trim() || null,
                hireDate,
                contractType: contract_type || "indefinido",
                workerType: worker_type || "normal",
                payFrequency: pay_frequency || "monthly",
                baseSalary: baseSalaryNum,
                isIntegralSalary: is_integral_salary === true || is_integral_salary === "true",
                riskLevel: risk_level || "I",
                position: position?.trim() || null,
                eps: eps?.trim() || null,
                pensionFund: pension_fund?.trim() || null,
                severanceFund: severance_fund?.trim() || null,
                compensationFund: compensation_fund?.trim() || null,
                bankName: bank_name?.trim() || null,
                bankAccountType: bank_account_type?.trim() || null,
                bankAccountNumber: bank_account_number?.trim() || null,
                workCity: work_city?.trim() || null,
                pointOfSaleId: point_of_sale_id || null,
                userId: userId || null,
                createdById: req.user.prismaId,
                updatedById: req.user.prismaId,
            },
            include: EMPLOYEE_INCLUDE,
        });

        emitAccountEvent(req.user.prismaId, "employee", "created");
        return res.status(201).json(new ApiResponse(201, mapEmployee(employee, req.user), "Employee created successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        if (error?.code === "P2002") return next(linkConflict());
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getEmployees = asyncHandler(async (req, res, next) => {
    try {
        const { status } = req.query;
        const where = { createdById: req.user.prismaId };
        if (status) where.status = status;

        const employees = await prisma.employee.findMany({
            where,
            include: EMPLOYEE_INCLUDE,
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json(new ApiResponse(200, employees.map((e) => mapEmployee(e, req.user)), "Employees fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getEmployee = asyncHandler(async (req, res, next) => {
    try {
        const employee = await findEmployeeByAnyId(req.params.id);
        if (!employee) return next(new ApiError(404, "Employee not found"));
        if (req.user.role !== "admin" && employee.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to view this employee"));
        }
        return res.status(200).json(new ApiResponse(200, mapEmployee(employee, req.user), "Employee fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updateEmployee = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        const existingEmployee = await findEmployeeByAnyId(id);
        if (!existingEmployee) return next(new ApiError(404, "Employee not found"));
        if (req.user.role !== "admin" && existingEmployee.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to update this employee"));
        }

        validateEnum(body.contract_type, CONTRACT_TYPES, "contract_type");
        validateEnum(body.worker_type, WORKER_TYPES, "worker_type");
        validateEnum(body.pay_frequency, PAY_FREQUENCIES, "pay_frequency");
        validateEnum(body.risk_level, RISK_LEVELS, "risk_level");
        validateEnum(body.status, STATUSES, "status");

        const userId = await resolveUserLink(existingEmployee.createdById, body.user_id);

        if (body.base_salary !== undefined) {
            const baseSalaryNum = Number(body.base_salary);
            if (!Number.isFinite(baseSalaryNum) || baseSalaryNum <= 0) {
                return next(new ApiError(400, "base_salary must be a positive number"));
            }
        }

        const employee = await updateWithConflictCheck({
            model: prisma.employee,
            id: existingEmployee.id,
            expectedUpdatedAt: parseExpectedUpdatedAt(body.expected_updated_at),
            data: {
                ...(body.document_type !== undefined && { documentType: body.document_type.trim() }),
                ...(body.document_number !== undefined && { documentNumber: String(body.document_number).trim() }),
                ...(body.first_name !== undefined && { firstName: body.first_name.trim() }),
                ...(body.second_name !== undefined && { secondName: body.second_name?.trim() || null }),
                ...(body.last_name !== undefined && { lastName: body.last_name.trim() }),
                ...(body.second_last_name !== undefined && { secondLastName: body.second_last_name?.trim() || null }),
                ...(body.email !== undefined && { email: body.email?.trim() || null }),
                ...(body.phone !== undefined && { phone: body.phone?.trim() || null }),
                ...(body.address !== undefined && { address: body.address?.trim() || null }),
                ...(body.hire_date !== undefined && { hireDate: new Date(body.hire_date) }),
                ...(body.termination_date !== undefined && { terminationDate: body.termination_date ? new Date(body.termination_date) : null }),
                ...(body.contract_end_date !== undefined && { contractEndDate: body.contract_end_date ? new Date(body.contract_end_date) : null }),
                ...(body.contract_type !== undefined && { contractType: body.contract_type }),
                ...(body.worker_type !== undefined && { workerType: body.worker_type }),
                ...(body.pay_frequency !== undefined && { payFrequency: body.pay_frequency }),
                ...(body.base_salary !== undefined && { baseSalary: Number(body.base_salary) }),
                ...(body.is_integral_salary !== undefined && { isIntegralSalary: body.is_integral_salary === true || body.is_integral_salary === "true" }),
                ...(body.risk_level !== undefined && { riskLevel: body.risk_level }),
                ...(body.position !== undefined && { position: body.position?.trim() || null }),
                ...(body.eps !== undefined && { eps: body.eps?.trim() || null }),
                ...(body.pension_fund !== undefined && { pensionFund: body.pension_fund?.trim() || null }),
                ...(body.severance_fund !== undefined && { severanceFund: body.severance_fund?.trim() || null }),
                ...(body.compensation_fund !== undefined && { compensationFund: body.compensation_fund?.trim() || null }),
                ...(body.bank_name !== undefined && { bankName: body.bank_name?.trim() || null }),
                ...(body.bank_account_type !== undefined && { bankAccountType: body.bank_account_type?.trim() || null }),
                ...(body.bank_account_number !== undefined && { bankAccountNumber: body.bank_account_number?.trim() || null }),
                ...(body.work_city !== undefined && { workCity: body.work_city?.trim() || null }),
                ...(body.point_of_sale_id !== undefined && { pointOfSaleId: body.point_of_sale_id || null }),
                ...(body.status !== undefined && { status: body.status }),
                ...(userId !== undefined && { userId }),
                updatedById: req.user.prismaId,
            },
            include: EMPLOYEE_INCLUDE,
            conflictMessage: "This employee was changed by someone else. Reload to see the latest version.",
        });

        emitAccountEvent(existingEmployee.createdById, "employee", "updated");
        return res.status(200).json(new ApiResponse(200, mapEmployee(employee, req.user), "Employee updated successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        if (error?.code === "P2002") return next(linkConflict());
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const deleteEmployee = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingEmployee = await findEmployeeByAnyId(id);
        if (!existingEmployee) return next(new ApiError(404, "Employee not found"));
        if (req.user.role !== "admin" && existingEmployee.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to delete this employee"));
        }

        await prisma.employee.delete({ where: { id: existingEmployee.id } });

        emitAccountEvent(existingEmployee.createdById, "employee", "deleted");
        return res.status(200).json(new ApiResponse(200, {}, "Employee deleted successfully"));
    } catch (error) {
        if (isForeignKeyRestrictError(error)) {
            return next(
                new ApiError(
                    409,
                    "This employee can't be deleted because they already have payroll history. Mark them as terminated instead.",
                    [],
                    "",
                    "employee_has_payroll_history"
                )
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// For the employee form's "Usuario en Ohnix" picker.
const getLinkableUsers = asyncHandler(async (req, res) =>
    res.status(200).json(new ApiResponse(200, await listLinkableUsers(req.user.prismaId), "Linkable users fetched"))
);

export { createEmployee, getEmployees, getEmployee, updateEmployee, deleteEmployee, getLinkableUsers, mapEmployee, findEmployeeByAnyId };
