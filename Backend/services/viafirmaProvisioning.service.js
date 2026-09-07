import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createItcycleViafirmaRequest,
    getItcycleViafirmaCertificateStatus,
    getItcycleViafirmaKycLink,
    listItcycleViafirmaCertificates,
    uploadItcycleViafirmaDocument,
    listItcycleViafirmaDocuments,
    revokeItcycleViafirmaCertificate,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";

// Viafirma provisioning for a company already registered with
// itcycle-api-dian (see registerCompanyWithItcycle in electronicInvoicing.service.js).
// Unlike firmaPassProvisioning.service.js, there is no pre-existing
// validation UUID to claim - a Viafirma request is created directly, and
// itcycle-api-dian returns its own certificateId that Ohnix must persist
// (Company self-service calls afterwards are scoped by that id, not by
// re-deriving it from provider state).

const requireItcycleProvisionedCompany = async ({ companyId }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!company.itcycleCompanyId) {
        throw new ApiError(422, "Company must be provisioned with itcycle-api-dian before Viafirma issuance can start");
    }
    return company;
};

const rethrowAsApiError = (error) => {
    const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
    throw new ApiError(502, error.message || "Viafirma provisioning request failed", providerPayload ? [providerPayload] : undefined);
};

export const createCompanyViafirmaRequest = async ({
    companyId,
    profileKind,
    subject,
    identityType,
    countryCode,
    identity,
    emailCertificate,
    organizationType,
}) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await createItcycleViafirmaRequest({
            companyId: company.itcycleCompanyId,
            profileKind,
            subject,
            identityType,
            countryCode,
            identity,
            emailCertificate,
            organizationType,
        });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const listCompanyViafirmaCertificates = async ({ companyId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await listItcycleViafirmaCertificates({ companyId: company.itcycleCompanyId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getCompanyViafirmaCertificateStatus = async ({ companyId, certificateId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleViafirmaCertificateStatus({ companyId: company.itcycleCompanyId, certificateId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const getCompanyViafirmaKycLink = async ({ companyId, certificateId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleViafirmaKycLink({ companyId: company.itcycleCompanyId, certificateId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const uploadCompanyViafirmaDocument = async ({ companyId, certificateId, name, base64 }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await uploadItcycleViafirmaDocument({ companyId: company.itcycleCompanyId, certificateId, name, base64 });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const listCompanyViafirmaDocuments = async ({ companyId, certificateId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await listItcycleViafirmaDocuments({ companyId: company.itcycleCompanyId, certificateId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const revokeCompanyViafirmaCertificate = async ({ companyId, certificateId, reason }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await revokeItcycleViafirmaCertificate({ companyId: company.itcycleCompanyId, certificateId, reason });
    } catch (error) {
        rethrowAsApiError(error);
    }
};
