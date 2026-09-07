import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    getItcycleCertificateProviderStatus,
    setItcycleCertificateProviderOverride,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";

// Which certificate provider (firmapass|viafirma) signs a company's real
// documents, for the rare case it has an ACTIVE certificate from more than
// one at once (mid-migration, or a manual contingency fallback) - see
// itcycle-api-dian's Company.certificateProviderOverride/loadDianConfig.
// Kept in its own file rather than folded into firmaPassProvisioning.service.js
// or viafirmaProvisioning.service.js since it's provider-agnostic, not
// specific to either.

const requireItcycleProvisionedCompany = async ({ companyId }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!company.itcycleCompanyId) {
        throw new ApiError(422, "Company must be provisioned with itcycle-api-dian before a certificate provider can be chosen");
    }
    return company;
};

const rethrowAsApiError = (error) => {
    const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
    throw new ApiError(502, error.message || "Certificate provider request failed", providerPayload ? [providerPayload] : undefined);
};

export const getCompanyCertificateProviderStatus = async ({ companyId }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await getItcycleCertificateProviderStatus({ companyId: company.itcycleCompanyId });
    } catch (error) {
        rethrowAsApiError(error);
    }
};

export const setCompanyCertificateProviderOverride = async ({ companyId, provider }) => {
    const company = await requireItcycleProvisionedCompany({ companyId });
    try {
        return await setItcycleCertificateProviderOverride({ companyId: company.itcycleCompanyId, provider });
    } catch (error) {
        rethrowAsApiError(error);
    }
};
