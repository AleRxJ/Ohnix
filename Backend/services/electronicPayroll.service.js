import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createItcyclePayroll,
    getItcyclePayrollStatus,
    retryItcyclePayrollSend,
    createItcyclePayrollAdjustment,
    getItcyclePayrollAdjustmentStatus,
    retryItcyclePayrollAdjustmentSend,
    isItcycleConfigured,
    ItcycleDianError,
} from "./itcycleDian.service.js";
import {
    ensureElectronicInvoicingPlan,
    buildItcyclePartyAddress,
    buildItcycleSendOptions,
    normalizeItcycleStatus,
} from "./electronicInvoicing.service.js";
import { decryptSecret } from "../utils/secretEncryption.js";
import { normalizeCountryCode } from "./companyCountry.service.js";
import { emitAccountEvent } from "../live/dataEvents.js";

/**
 * Nómina Electrónica (DIAN Resolución 000013 de 2021) submission - the
 * payroll counterpart to electronicInvoicing.service.js, mirroring its exact
 * claim/submit/sync shape but scoped to one PayrollDocument (one employee's
 * payslip) instead of one Order, since DIAN requires a separate
 * NominaIndividual XML per employee per period rather than one per period.
 *
 * ⚠️ itcycle-api-dian's own payroll pipeline (dian-engine's payroll types/
 * CUNE/XML builder) has not been validated against DIAN's official Anexo
 * Técnico or a real habilitación run - see that repo's own caveats. This
 * mapping layer inherits the same "verify before production use" status.
 */

const ITCYCLE_PROVIDER = "itcycle";
const TERMINAL_STATUSES = ["accepted", "cancelled"];
const SYNCABLE_STATUSES = ["issuing", "submitted", "contingency"];

const text = (value) => `${value || ""}`.trim();
const round2 = (value) => Number(Number(value).toFixed(2));

// DIAN "TipoDocumento" catalog subset - Employee.documentType is a free
// dropdown value (EmployeeModal.jsx: CC/CE/PA/PEP), not already a DIAN code
// the way Customer/Supplier's identificationDocumentCode is.
const WORKER_DOCUMENT_TYPE_CODES = { CC: "13", CE: "22", PA: "41", PEP: "47" };

// Employee.workerType conflates DIAN's TipoTrabajador (dependiente/pensionado/
// aprendiz) and SubTipoTrabajador (normal/alto riesgo) catalogs into a single
// enum - bridge both DIAN fields from this one value.
const WORKER_TYPE_MAP = {
    normal: { workerType: "01", subType: "00" },
    alto_riesgo: { workerType: "01", subType: "01" },
    pensionado: { workerType: "04", subType: "00" },
    aprendiz: { workerType: "12", subType: "00" },
};

const CONTRACT_TYPE_CODES = { indefinido: "1", fijo: "2", obra_labor: "3", aprendizaje: "4" };

// DIAN's "Periodo" catalog also has decadal/catorcenal values that Ohnix's
// own Employee.payFrequency has no equivalent for.
const PERIODICITY_CODES = { weekly: "1", biweekly: "4", monthly: "5" };

// Ohnix's PayrollConceptCode -> itcycle-api-dian's internal PayrollAmountLine
// concept key (see dian-engine's xml/payroll-builder.ts CONCEPT_ELEMENT
// table) - an unmapped concept falls through to "otro", which that builder
// routes into the XML's generic OtrosConceptos/OtrasDeducciones bucket
// instead of failing outright. employer_contribution lines (the employer's
// own social-security/parafiscal/prestaciones cost) are never sent at all -
// DIAN's NominaIndividual only reports what the EMPLOYEE earns/has deducted.
const EARNING_CONCEPT_MAP = {
    basic_salary: "basico",
    transport_allowance: "transporte",
    overtime_day: "horas_extra_diurna",
    overtime_night: "horas_extra_nocturna",
    surcharge_night: "recargo_nocturno",
    surcharge_sunday_holiday: "recargo_dominical_festivo",
    overtime_sunday_holiday_day: "horas_extra_dominical_festivo_diurna",
    overtime_sunday_holiday_night: "horas_extra_dominical_festivo_nocturna",
    common_vacation: "vacaciones",
    bonus: "bonificacion",
};
const DEDUCTION_CONCEPT_MAP = {
    health_employee: "salud",
    pension_employee: "pension",
    pension_solidarity_fund: "fondo_solidaridad",
    withholding_tax: "retencion_fuente",
};

const buildWorker = (employee) => {
    const { workerType, subType } = WORKER_TYPE_MAP[employee.workerType] || WORKER_TYPE_MAP.normal;
    return {
        identification: {
            number: employee.documentNumber,
            type: WORKER_DOCUMENT_TYPE_CODES[employee.documentType] || "13",
        },
        firstName: employee.firstName,
        otherNames: employee.secondName || undefined,
        surname: employee.lastName,
        secondSurname: employee.secondLastName || undefined,
        workerType,
        subType,
        integralSalary: employee.isIntegralSalary,
        contractType: CONTRACT_TYPE_CODES[employee.contractType] || "1",
        // Employee has no DANE-coded address of its own yet (only a free-text
        // workCity/address) - reuses the same "11001" (Bogotá) default
        // buildItcyclePartyAddress already applies for Customer/Supplier rows
        // missing a municipalityCode, rather than inventing a second gap-filling rule.
        workplace: buildItcyclePartyAddress(undefined, employee.workCity || employee.address),
        baseSalary: Number(employee.baseSalary),
    };
};

const buildPeriod = (employee, payrollPeriod, workedDays) => ({
    admissionDate: employee.hireDate.toISOString(),
    settlementStartDate: payrollPeriod.startDate.toISOString(),
    settlementEndDate: payrollPeriod.endDate.toISOString(),
    periodicity: PERIODICITY_CODES[payrollPeriod.periodicity] || "5",
    workedDays: Number(workedDays),
});

const buildPayment = (employee, company) => ({
    paymentForm: "1",
    // "42" consignación bancaria when a bank account is on file, otherwise
    // fall back to the same company-level default buildItcyclePayload uses.
    paymentMethod: employee.bankAccountNumber ? "42" : company.factusPaymentMethodCode || "10",
    bankName: employee.bankName || undefined,
    accountType: employee.bankAccountType || undefined,
    accountNumber: employee.bankAccountNumber || undefined,
});

const toAmountLine = (conceptMap) => (line) => ({
    concept: conceptMap[line.conceptCode] || "otro",
    quantity: line.quantity != null ? Number(line.quantity) : undefined,
    description: line.description || undefined,
    amount: Number(line.amount),
});

const buildEarnings = (lines) => {
    const earningLines = lines.filter((l) => l.category === "earning").map(toAmountLine(EARNING_CONCEPT_MAP));
    return { lines: earningLines, total: round2(earningLines.reduce((sum, l) => sum + l.amount, 0)) };
};

const buildDeductions = (lines) => {
    const deductionLines = lines.filter((l) => l.category === "deduction").map(toAmountLine(DEDUCTION_CONCEPT_MAP));
    return { lines: deductionLines, total: round2(deductionLines.reduce((sum, l) => sum + l.amount, 0)) };
};

const buildItcyclePayrollPayload = (document, company) => {
    const now = new Date();
    return {
        issueDate: now.toISOString(),
        issueTime: now.toISOString(),
        worker: buildWorker(document.employee),
        period: buildPeriod(document.employee, document.payrollPeriod, document.workedDays),
        payment: buildPayment(document.employee, company),
        earnings: buildEarnings(document.lines),
        deductions: buildDeductions(document.lines),
        netPay: Number(document.netPay),
    };
};

// itcycle-api-dian's own PayrollDocument.status values - see
// electronicInvoicing.service.js#normalizeItcycleStatus for the identical
// invoicing-side mapping this reuses unchanged.
const mapItcyclePayrollResponse = (raw) => ({
    externalId: text(raw?.id) || null,
    documentNumber: text(raw?.documentNumber) || null,
    cune: text(raw?.cune) || null,
    status: normalizeItcycleStatus(raw?.status),
    certificateId: text(raw?.certificateId) || null,
    certificateProvider: text(raw?.certificate?.provider) || null,
    certificateIdentifier: text(raw?.certificate?.certificateIdentifier) || null,
    rawResponse: raw,
});

const getDocumentWithRelations = (documentId) => prisma.payrollDocument.findFirst({
    where: { id: documentId },
    include: {
        employee: true,
        lines: true,
        payrollPeriod: { include: { createdBy: { select: { id: true, companyId: true, company: true } } } },
        electronicPayroll: {
            include: {
                events: { orderBy: { createdAt: "asc" } },
                adjustments: { orderBy: { createdAt: "asc" } },
            },
        },
    },
});

const canManageDocument = (document, requesterUserId, requesterRole) =>
    requesterRole === "admin" || document.payrollPeriod.createdById === requesterUserId;

const serializeEvent = (event) => ({ id: event.id, eventType: event.eventType, status: event.status, createdAt: event.createdAt });

const serializeAdjustment = (adjustment) => !adjustment ? null : ({
    id: adjustment.id, electronicPayrollDocumentId: adjustment.electronicPayrollDocumentId,
    adjustmentType: adjustment.adjustmentType, status: adjustment.status, referenceCode: adjustment.referenceCode,
    externalId: adjustment.externalId, documentNumber: adjustment.documentNumber, cune: adjustment.cune,
    errorMessage: adjustment.errorMessage, issuedAt: adjustment.issuedAt,
    createdAt: adjustment.createdAt, updatedAt: adjustment.updatedAt,
});

const serialize = (record) => !record ? null : ({
    id: record.id, payrollDocumentId: record.payrollDocumentId, countryCode: record.countryCode,
    provider: record.provider, status: record.status, referenceCode: record.referenceCode,
    externalId: record.externalId, documentNumber: record.documentNumber, cune: record.cune,
    certificateId: record.certificateId, certificateProvider: record.certificateProvider, certificateIdentifier: record.certificateIdentifier,
    errorMessage: record.errorMessage, issuedAt: record.issuedAt,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
    events: Array.isArray(record.events) ? record.events.map(serializeEvent) : undefined,
    adjustments: Array.isArray(record.adjustments) ? record.adjustments.map(serializeAdjustment) : undefined,
});

export const getElectronicPayrollForDocument = async ({ documentId, requesterUserId, requesterRole }) => {
    const document = await getDocumentWithRelations(documentId);
    if (!document) throw new ApiError(404, "Payroll document not found");
    if (!canManageDocument(document, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this payroll document");
    return {
        documentId: document.id,
        companyCountryCode: normalizeCountryCode(document.payrollPeriod.createdBy?.company?.countryCode),
        electronicPayroll: serialize(document.electronicPayroll),
    };
};

const claimElectronicPayroll = async ({ document, company, payload }) => {
    const existing = document.electronicPayroll;
    if (existing && (TERMINAL_STATUSES.includes(existing.status) || ["submitted", "issuing"].includes(existing.status))) {
        return { record: existing, claimed: false };
    }
    const data = { countryCode: "CO", provider: ITCYCLE_PROVIDER, status: "issuing", rawRequest: payload, errorMessage: null };
    if (existing) {
        const result = await prisma.electronicPayrollDocument.updateMany({ where: { id: existing.id, status: { in: ["draft", "error", "rejected"] } }, data });
        if (!result.count) return { record: await prisma.electronicPayrollDocument.findUnique({ where: { id: existing.id } }), claimed: false };
        const record = await prisma.electronicPayrollDocument.findUnique({ where: { id: existing.id } });
        await prisma.electronicPayrollDocumentEvent.create({ data: { electronicPayrollDocumentId: record.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { record, claimed: true };
    }
    try {
        const record = await prisma.electronicPayrollDocument.create({
            data: { payrollDocumentId: document.id, companyId: company.id, referenceCode: document.id, ...data },
        });
        await prisma.electronicPayrollDocumentEvent.create({ data: { electronicPayrollDocumentId: record.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { record, claimed: true };
    } catch (error) {
        if (error.code !== "P2002") throw error;
        return { record: await prisma.electronicPayrollDocument.findUnique({ where: { payrollDocumentId: document.id } }), claimed: false };
    }
};

export const issueElectronicPayrollForDocument = async ({ documentId, requesterUserId, requesterRole, trigger = "manual" }) => {
    const document = await getDocumentWithRelations(documentId);
    if (!document) throw new ApiError(404, "Payroll document not found");
    if (!canManageDocument(document, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue this payroll document");
    if (!["approved", "paid"].includes(document.payrollPeriod.status)) {
        throw new ApiError(409, "Electronic payroll can only be issued once its period has been approved");
    }

    const accountId = document.payrollPeriod.createdById;
    const company = document.payrollPeriod.createdBy.company;
    if (normalizeCountryCode(company?.countryCode) !== "CO") throw new ApiError(409, "Electronic payroll requires an explicitly configured Colombia company");
    // Same "costs real money per DIAN document, gated even for admins acting
    // on someone's behalf" plan check invoicing uses - both share the same
    // itcycle-api-dian company provisioning/habilitación.
    await ensureElectronicInvoicingPlan(accountId);

    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    if (!text(company.itcycleCompanyId) || !text(company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    }
    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
    const payload = buildItcyclePayrollPayload(document, company);
    const claim = await claimElectronicPayroll({ document, company, payload });
    const submit = () =>
        createItcyclePayroll({ apiKey, internalReference: document.id, payroll: payload, send: buildItcycleSendOptions(company) }).then(mapItcyclePayrollResponse);

    if (!claim.claimed) return { reused: true, trigger, countryCode: "CO", electronicPayroll: serialize(claim.record) };
    try {
        const mapped = await submit();
        const record = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicPayrollDocument.update({
                where: { id: claim.record.id },
                data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null },
            });
            await tx.electronicPayrollDocumentEvent.create({ data: { electronicPayrollDocumentId: updated.id, eventType: "provider_response", status: updated.status, payload: mapped.rawResponse } });
            return updated;
        });
        emitAccountEvent(accountId, "payrollDocument", "electronic_payroll_issued");
        return { reused: false, trigger, countryCode: "CO", electronicPayroll: serialize(record) };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        const record = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicPayrollDocument.update({
                where: { id: claim.record.id },
                data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown itcycle-api-dian error" },
            });
            await tx.electronicPayrollDocumentEvent.create({ data: { electronicPayrollDocumentId: updated.id, eventType: "provider_error", status: "error", payload: providerPayload } });
            return updated;
        });
        throw new ApiError(502, record.errorMessage);
    }
};

export const syncElectronicPayrollStatus = async ({ documentId, requesterUserId, requesterRole }) => {
    const document = await getDocumentWithRelations(documentId);
    if (!document) throw new ApiError(404, "Payroll document not found");
    if (!canManageDocument(document, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this payroll document");

    const record = document.electronicPayroll;
    if (!record) throw new ApiError(404, "This payroll document has no electronic payroll submission to sync");
    if (!SYNCABLE_STATUSES.includes(record.status)) throw new ApiError(409, `Electronic payroll status "${record.status}" cannot be synced`);

    const company = document.payrollPeriod.createdBy.company;
    try {
        if (!record.externalId) throw new ApiError(409, "This electronic payroll document does not have a provider id yet");
        if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
        if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
        const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
        const mapped = record.status === "contingency"
            ? mapItcyclePayrollResponse(await retryItcyclePayrollSend({ apiKey, id: record.externalId, send: buildItcycleSendOptions(company) }))
            : mapItcyclePayrollResponse(await getItcyclePayrollStatus({ apiKey, id: record.externalId }));
        const updated = await prisma.$transaction(async (tx) => {
            const updatedRecord = await tx.electronicPayrollDocument.update({
                where: { id: record.id },
                data: { ...mapped, errorMessage: mapped.status === "rejected" ? "Payroll document rejected by provider" : null, issuedAt: mapped.status === "accepted" ? new Date() : record.issuedAt },
            });
            await tx.electronicPayrollDocumentEvent.create({ data: { electronicPayrollDocumentId: updatedRecord.id, eventType: "manual_sync", status: updatedRecord.status, payload: mapped.rawResponse } });
            return updatedRecord;
        });
        return { electronicPayroll: serialize(updated) };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        await prisma.electronicPayrollDocumentEvent.create({
            data: { electronicPayrollDocumentId: record.id, eventType: "manual_sync_error", status: record.status, payload: providerPayload || { message: error.message } },
        });
        throw new ApiError(502, error.message || "Failed to sync electronic payroll status with itcycle-api-dian");
    }
};

// Bulk convenience for an approved period - DIAN nómina is inherently one
// document per employee (unlike invoicing's one order = one invoice), so
// this issues each of the period's documents independently and tolerates
// per-employee failures instead of treating the whole period as one atomic
// operation (one rejected/misconfigured employee shouldn't block the rest).
export const issueElectronicPayrollForPeriod = async ({ periodId, requesterUserId, requesterRole }) => {
    const period = await prisma.payrollPeriod.findFirst({
        where: { id: periodId },
        include: { documents: { select: { id: true } } },
    });
    if (!period) throw new ApiError(404, "Payroll period not found");
    if (requesterRole !== "admin" && period.createdById !== requesterUserId) {
        throw new ApiError(403, "You are not authorized to issue this payroll period");
    }

    const results = [];
    for (const document of period.documents) {
        try {
            const result = await issueElectronicPayrollForDocument({ documentId: document.id, requesterUserId, requesterRole, trigger: "bulk" });
            results.push({ documentId: document.id, ok: true, ...result });
        } catch (error) {
            results.push({ documentId: document.id, ok: false, error: error.message });
        }
    }
    return results;
};

// Nómina Individual de Ajuste ("1" Reemplazar / "2" Eliminar) - a correction
// against an already-ACCEPTED ElectronicPayrollDocument. Always references it
// by itcycle-api-dian's own externalId; that side derives predecessorCune
// from its own record and never trusts the caller, same as invoicing's
// credit/debit notes referencing their original invoice.
export const issueElectronicPayrollAdjustment = async ({ documentId, adjustmentType, requesterUserId, requesterRole, trigger = "manual" }) => {
    if (!["1", "2"].includes(adjustmentType)) {
        throw new ApiError(400, 'adjustmentType must be "1" (reemplazar) or "2" (eliminar)');
    }
    const document = await getDocumentWithRelations(documentId);
    if (!document) throw new ApiError(404, "Payroll document not found");
    if (!canManageDocument(document, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue this payroll document");

    const record = document.electronicPayroll;
    if (!record || record.status !== "accepted" || !record.externalId) {
        throw new ApiError(409, "An electronic payroll adjustment can only be issued against an ACCEPTED electronic payroll document");
    }

    const accountId = document.payrollPeriod.createdById;
    const company = document.payrollPeriod.createdBy.company;
    await ensureElectronicInvoicingPlan(accountId);
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);

    // A correction resends the same current data (there's no separate "what
    // changed" input in this phase) - DIAN's "Reemplazar" mode fully replaces
    // the original regardless, and "Eliminar" still needs a structurally
    // complete document even though it voids it.
    const payload = buildItcyclePayrollPayload(document, company);
    const referenceCode = `${record.referenceCode}-ADJ-${Date.now().toString(36).toUpperCase()}`;

    const adjustment = await prisma.electronicPayrollAdjustment.create({
        data: {
            electronicPayrollDocumentId: record.id,
            companyId: company.id,
            countryCode: "CO",
            provider: ITCYCLE_PROVIDER,
            adjustmentType,
            status: "issuing",
            referenceCode,
            rawRequest: payload,
        },
    });

    try {
        const raw = await createItcyclePayrollAdjustment({
            apiKey,
            internalReference: referenceCode,
            payrollDocumentId: record.externalId,
            adjustmentType,
            payroll: payload,
            send: buildItcycleSendOptions(company),
        });
        const mapped = mapItcyclePayrollResponse(raw);
        const updated = await prisma.electronicPayrollAdjustment.update({
            where: { id: adjustment.id },
            data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null },
        });
        emitAccountEvent(accountId, "payrollDocument", "electronic_payroll_adjustment_issued");
        return { trigger, countryCode: "CO", adjustment: serializeAdjustment(updated) };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        const updated = await prisma.electronicPayrollAdjustment.update({
            where: { id: adjustment.id },
            data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown itcycle-api-dian error" },
        });
        throw new ApiError(502, updated.errorMessage);
    }
};

export const syncElectronicPayrollAdjustmentStatus = async ({ documentId, adjustmentId, requesterUserId, requesterRole }) => {
    const document = await getDocumentWithRelations(documentId);
    if (!document) throw new ApiError(404, "Payroll document not found");
    if (!canManageDocument(document, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this payroll document");

    const adjustment = (document.electronicPayroll?.adjustments || []).find((a) => a.id === adjustmentId);
    if (!adjustment) throw new ApiError(404, "Electronic payroll adjustment not found");
    if (!SYNCABLE_STATUSES.includes(adjustment.status)) throw new ApiError(409, `Electronic payroll adjustment status "${adjustment.status}" cannot be synced`);

    const company = document.payrollPeriod.createdBy.company;
    try {
        if (!adjustment.externalId) throw new ApiError(409, "This electronic payroll adjustment does not have a provider id yet");
        if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
        if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
        const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
        const mapped = adjustment.status === "contingency"
            ? mapItcyclePayrollResponse(await retryItcyclePayrollAdjustmentSend({ apiKey, id: adjustment.externalId, send: buildItcycleSendOptions(company) }))
            : mapItcyclePayrollResponse(await getItcyclePayrollAdjustmentStatus({ apiKey, id: adjustment.externalId }));
        const updated = await prisma.electronicPayrollAdjustment.update({
            where: { id: adjustment.id },
            data: { ...mapped, errorMessage: mapped.status === "rejected" ? "Payroll adjustment rejected by provider" : null, issuedAt: mapped.status === "accepted" ? new Date() : adjustment.issuedAt },
        });
        return { adjustment: serializeAdjustment(updated) };
    } catch (error) {
        throw new ApiError(502, error.message || "Failed to sync electronic payroll adjustment status with itcycle-api-dian");
    }
};
