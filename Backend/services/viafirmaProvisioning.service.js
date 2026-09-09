import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createItcycleViafirmaRequest,
    getItcycleViafirmaCertificateStatus,
    getItcycleViafirmaKycLink,
    getItcycleViafirmaTerms,
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
    // itcycle-api-dian's own error handler marks a Viafirma transport/infra
    // failure (timeout, 5xx, a Sandbox quirk returning HTML instead of JSON -
    // see ViafirmaApiClient.ts) this way - `error.message` at that point is
    // an English dev-facing fallback, not something to show a user verbatim
    // (same reasoning as ensureElectronicInvoicingPlan's own `code` further
    // down this file's callers). `code` lets the self-service UI show a
    // proper translated message instead - see fiscal_setup.viafirma_technical_error.
    const code = providerPayload?.error === "certificate_provider_technical_error" ? "viafirma_technical_error" : undefined;
    throw new ApiError(502, error.message || "Viafirma provisioning request failed", providerPayload ? [providerPayload] : undefined, "", code);
};

export const getCompanyViafirmaTerms = async ({ companyId, profileKind }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleViafirmaTerms({ companyId: company.itcycleCompanyId, profileKind });
    } catch (error) {
        rethrowAsApiError(error);
    }
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
    termsAccepted,
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
            termsAccepted,
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
