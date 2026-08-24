import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    setItcycleFirmaPassLoginKey,
    uploadItcycleFirmaPassRut,
    uploadItcycleFirmaPassArchivo,
    confirmItcycleFirmaPassValidation,
    getItcycleFirmaPassStatus,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";

// FirmaPass provisioning for a company already registered with itcycle-api-dian
// (see registerCompanyWithItcycle in electronicInvoicing.service.js) - unlike
// that one-shot pipeline, these 4 actions are independently triggered, often
// hours apart, against a validationUuid the admin creates by hand in
// FirmaPass's own portal (no API exists to create it). Kept in its own file
// rather than folded into electronicInvoicing.service.js (already 1000+ lines
// of Alanube/Factus/itcycle invoicing orchestration) since this is a distinct,
// narrower concern - identity-validation bookkeeping, not invoicing.

const requireItcycleProvisionedCompany = async ({ companyId, requesterRole }) => {
    if (requesterRole !== "admin") throw new ApiError(403, "Only admins can manage FirmaPass provisioning");
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!company.itcycleCompanyId) {
        throw new ApiError(422, "Company must be provisioned with itcycle-api-dian before FirmaPass issuance can start");
    }
    return company;
};

const rethrowAsApiError = (error) => {
    const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
    throw new ApiError(502, error.message || "FirmaPass provisioning request failed", providerPayload ? [providerPayload] : undefined);
};

export const setCompanyFirmaPassLoginKey = async ({ companyId, requesterRole, loginKey }) => {
    const company = await requireItcycleProvisionedCompany({ companyId, requesterRole });
    try {
        await setItcycleFirmaPassLoginKey({ companyId: company.itcycleCompanyId, loginKey });
        return { companyId };
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const uploadCompanyFirmaPassRut = async ({ companyId, requesterRole, validationUuid, rutBase64, identificacionRepresentanteLegal }) => {
    const company = await requireItcycleProvisionedCompany({ companyId, requesterRole });
    try {
        return await uploadItcycleFirmaPassRut({
            companyId: company.itcycleCompanyId,
            validationUuid,
            rutBase64,
            identificacionRepresentanteLegal,
        });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const uploadCompanyFirmaPassArchivo = async ({ companyId, requesterRole, validationUuid, type, fileBase64 }) => {
    const company = await requireItcycleProvisionedCompany({ companyId, requesterRole });
    try {
        return await uploadItcycleFirmaPassArchivo({ companyId: company.itcycleCompanyId, validationUuid, type, fileBase64 });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const confirmCompanyFirmaPassValidation = async ({ companyId, requesterRole, validationUuid }) => {
    const company = await requireItcycleProvisionedCompany({ companyId, requesterRole });
    try {
        return await confirmItcycleFirmaPassValidation({ companyId: company.itcycleCompanyId, validationUuid });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getCompanyFirmaPassStatus = async ({ companyId, requesterRole }) => {
    const company = await requireItcycleProvisionedCompany({ companyId, requesterRole });
    try {
        return await getItcycleFirmaPassStatus({ companyId: company.itcycleCompanyId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};
