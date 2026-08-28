import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    listItcycleFirmaPassValidations,
    getItcycleFirmaPassNuevaSolicitud,
    getItcycleFirmaPassValidationDetail,
    uploadItcycleFirmaPassRut,
    uploadItcycleFirmaPassArchivo,
    confirmItcycleFirmaPassValidation,
    getItcycleFirmaPassStatus,
    getItcycleDianReadiness,
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

const requireItcycleProvisionedCompany = async ({ companyId }) => {
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

// Alliance-wide (not scoped to a company - see itcycleDian.service.js).
// Ohnix-platform-admin-only: lets an admin browse validations auto-attached
// to iTCycle's FirmaPass account (every client who bought a certificate with
// the coupon) and match one to the right Ohnix company - by `orderNumber`
// (exact server-side lookup) when a real purchase set one, otherwise by eye
// via `nombre`/`owner_email`.
export const listPendingFirmaPassValidations = async ({ perPage, orderNumber } = {}) => {
    try {
        return await listItcycleFirmaPassValidations({ perPage, orderNumber });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getNextPendingFirmaPassValidation = async () => {
    try {
        return await getItcycleFirmaPassNuevaSolicitud();
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getFirmaPassValidationDetail = async ({ validationUuid }) => {
    try {
        return await getItcycleFirmaPassValidationDetail({ validationUuid });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

// Lets a company self-serve "I already bought with FirmaPass, here's my
// order number" instead of hunting down and pasting the raw UUID -
// `orderNumber` is an exact filter (see listItcycleFirmaPassValidations), so
// this is safe to expose to a non-admin caller even though the underlying
// itcycle-api-dian call is alliance-wide/admin-authenticated: a company can
// only ever know its OWN order number, and the response here is trimmed down
// to just {uuid, nombre} - never the full alliance-wide payload.
export const resolveCompanyFirmaPassOrderNumber = async ({ companyId, orderNumber }) => {
    await requireItcycleProvisionedCompany({ companyId });
    let result;
    try {
        result = await listItcycleFirmaPassValidations({ orderNumber });
    } catch (error) {
        rethrowAsApiError(error);
    }
    const match = (result?.data || [])[0];
    if (!match) {
        throw new ApiError(404, "No encontramos ninguna validación de FirmaPass con ese número de orden. Verifica el número o pega el UUID manualmente.");
    }
    return { uuid: match.uuid, nombre: match.nombre };
};

export const uploadCompanyFirmaPassRut = async ({ companyId, validationUuid, rutBase64, identificacionRepresentanteLegal }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
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

export const uploadCompanyFirmaPassArchivo = async ({ companyId, validationUuid, type, fileBase64 }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await uploadItcycleFirmaPassArchivo({ companyId: company.itcycleCompanyId, validationUuid, type, fileBase64 });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const confirmCompanyFirmaPassValidation = async ({ companyId, validationUuid }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await confirmItcycleFirmaPassValidation({ companyId: company.itcycleCompanyId, validationUuid });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getCompanyFirmaPassStatus = async ({ companyId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleFirmaPassStatus({ companyId: company.itcycleCompanyId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getCompanyDianReadiness = async ({ companyId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleDianReadiness({ companyId: company.itcycleCompanyId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};
