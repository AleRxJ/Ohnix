import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { registerCompanyWithItcycle, addItcycleNumberingResolutionForCompany } from "../services/electronicInvoicing.service.js";
import {
    listPendingFirmaPassValidations,
    getNextPendingFirmaPassValidation,
    getFirmaPassValidationDetail,
    uploadCompanyFirmaPassRut,
    uploadCompanyFirmaPassArchivo,
    confirmCompanyFirmaPassValidation,
    getCompanyFirmaPassStatus,
} from "../services/firmaPassProvisioning.service.js";
import { listCertificateOrdersAdmin as listCertificateOrdersAdminService } from "../services/certificateOrder.service.js";
import * as incomeTaxConfigService from "../services/incomeTaxConfig.service.js";
import {
    createExternalApiClient,
    listExternalApiClients,
    issueApiKeyForExternalClient,
    listLiveApiKeysForExternalClient,
    getUsageForExternalClient,
    createBillingEnrollmentLink,
    getBillingHistoryForExternalClient,
} from "../services/externalApiClient.service.js";

// Deliberately distinct from companyCountry.service.js#normalizeCountryCode:
// that one just normalizes an already-stored value for fiscal checks, while
// this one validates the ISO-2 *format* of user-submitted input and rejects
// anything malformed.
const parseIsoCountryCode = (value) => {
    const normalized = `${value || ""}`.trim().toUpperCase();
    if (!normalized) {
        return null;
    }

    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

const VAT_RESPONSIBILITIES = ["unset", "responsible", "not_responsible"];

const companyFiscalSelect = {
    vatResponsible: true,
    vatResponsibleEffectiveFrom: true,
    electronicInvoicingEnabled: true,
    electronicInvoicingProvider: true,
    factusNumberingRangeId: true,
    factusCreditNoteNumberingRangeId: true,
    factusDocumentType: true,
    factusOperationType: true,
    factusPaymentForm: true,
    factusPaymentMethodCode: true,
    taxIdentification: true,
    taxIdentificationDv: true,
    alanubeCompanyId: true,
    alanubeTestSetId: true,
    alanubeInvoiceResolution: true,
    alanubeCreditNoteResolution: true,
    itcycleCompanyId: true,
};

// vatResponsibleEffectiveFrom records when the company's current VAT status
// (ET art. 437) started applying, so a later change of status never rewrites
// the tax treatment of orders placed under the previous one - only bump it
// when the value is actually changing, not on every unrelated save.
const normalizeVatResponsible = (body, currentValue) => {
    if (body.vatResponsible === undefined) return {};
    const normalized = `${body.vatResponsible || ""}`.trim();
    if (!VAT_RESPONSIBILITIES.includes(normalized)) return null;
    const config = { vatResponsible: normalized };
    if (normalized !== currentValue) {
        config.vatResponsibleEffectiveFrom = normalized === "unset" ? null : new Date();
    }
    return config;
};

const normalizeElectronicInvoicingIdentity = (body) => {
    const config = {};
    if (body.taxIdentification !== undefined) {
        config.taxIdentification = `${body.taxIdentification || ""}`.trim() || null;
    }
    if (body.taxIdentificationDv !== undefined) {
        config.taxIdentificationDv = `${body.taxIdentificationDv || ""}`.trim() || null;
    }
    return config;
};

export const listCompaniesAdmin = asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            logoUrl: true,
            pdfFooterText: true,
            pdfAccentColor: true,
            ...companyFiscalSelect,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, companies, "Companies fetched successfully"));
});

export const createCompanyAdmin = asyncHandler(async (req, res, next) => {
    const { name, legalName, countryCode, contactEmail, phone } = req.body;

    if (!name?.trim()) {
        return next(new ApiError(400, "Company name is required"));
    }

    const normalizedName = name.trim();
    const normalizedCountryCode = parseIsoCountryCode(countryCode);
    const normalizedContactEmail = contactEmail?.trim().toLowerCase() || null;
    const hasExplicitCountry =
        countryCode !== undefined && `${countryCode || ""}`.trim() !== "";

    if (hasExplicitCountry && !normalizedCountryCode) {
        return next(new ApiError(400, "countryCode must be a valid ISO-2 code (e.g. CO, ES)"));
    }

    const vatResponsibleConfig = normalizeVatResponsible(req.body, undefined);
    if (vatResponsibleConfig === null) {
        return next(new ApiError(400, `vatResponsible must be one of: ${VAT_RESPONSIBILITIES.join(", ")}`));
    }

    const existed = await prisma.company.findFirst({
        where: {
            name: {
                equals: normalizedName,
                mode: "insensitive",
            },
        },
        select: { id: true },
    });

    if (existed) {
        return next(new ApiError(409, "Company already exists"));
    }

    const company = await prisma.company.create({
        data: {
            name: normalizedName,
            legalName: legalName?.trim() || null,
            countryCode: normalizedCountryCode,
            contactEmail: normalizedContactEmail,
            phone: phone?.trim() || null,
            ...vatResponsibleConfig,
            electronicInvoicingProvider: "itcycle",
            ...normalizeElectronicInvoicingIdentity(req.body),
            isActive: true,
        },
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            vatResponsible: true,
            vatResponsibleEffectiveFrom: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return res
        .status(201)
        .json(new ApiResponse(201, company, "Company created successfully"));
});

export const updateCompanyAdmin = asyncHandler(async (req, res, next) => {
    const { companyId } = req.params;
    const { name, legalName, countryCode, contactEmail, phone, isActive, pdfFooterText, pdfAccentColor } =
        req.body;

    const normalizedCountryCode = parseIsoCountryCode(countryCode);
    const hasExplicitCountry =
        countryCode !== undefined && `${countryCode || ""}`.trim() !== "";

    if (hasExplicitCountry && !normalizedCountryCode) {
        return next(new ApiError(400, "countryCode must be a valid ISO-2 code (e.g. CO, ES)"));
    }

    const trimmedAccentColor = pdfAccentColor?.trim();
    if (trimmedAccentColor && !/^#[0-9A-Fa-f]{6}$/.test(trimmedAccentColor)) {
        return next(new ApiError(400, "pdfAccentColor must be a hex color like #29D8D5"));
    }

    const existing = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, vatResponsible: true },
    });

    if (!existing) {
        return next(new ApiError(404, "Company not found"));
    }

    const vatResponsibleConfig = normalizeVatResponsible(req.body, existing.vatResponsible);
    if (vatResponsibleConfig === null) {
        return next(new ApiError(400, `vatResponsible must be one of: ${VAT_RESPONSIBILITIES.join(", ")}`));
    }

    if (name?.trim()) {
        const collision = await prisma.company.findFirst({
            where: {
                id: { not: companyId },
                name: {
                    equals: name.trim(),
                    mode: "insensitive",
                },
            },
            select: { id: true },
        });

        if (collision) {
            return next(new ApiError(409, "Another company already uses that name"));
        }
    }

    const company = await prisma.company.update({
        where: { id: companyId },
        data: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(legalName !== undefined ? { legalName: legalName?.trim() || null } : {}),
            ...(countryCode !== undefined
                ? { countryCode: hasExplicitCountry ? normalizedCountryCode : null }
                : {}),
            ...(contactEmail !== undefined
                ? { contactEmail: contactEmail?.trim().toLowerCase() || null }
                : {}),
            ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
            ...(typeof isActive === "boolean" ? { isActive } : {}),
            ...(pdfFooterText !== undefined ? { pdfFooterText: pdfFooterText?.trim() || null } : {}),
            ...(pdfAccentColor !== undefined ? { pdfAccentColor: trimmedAccentColor || null } : {}),
            ...vatResponsibleConfig,
            ...normalizeElectronicInvoicingIdentity(req.body),
        },
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            contactEmail: true,
            phone: true,
            isActive: true,
            logoUrl: true,
            pdfFooterText: true,
            pdfAccentColor: true,
            ...companyFiscalSelect,
            createdAt: true,
            updatedAt: true,
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, company, "Company updated successfully"));
});

export const registerCompanyWithItcycleAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { supplierProfile, numberingResolutions, certificate } = req.body || {};

    const data = await registerCompanyWithItcycle({
        companyId,
        requesterRole: req.user.role,
        supplierProfile,
        numberingResolutions,
        certificate,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Company provisioned with itcycle-api-dian successfully"));
});

export const addItcycleNumberingResolutionAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { documentType, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate } = req.body || {};

    const data = await addItcycleNumberingResolutionForCompany({
        companyId,
        requesterRole: req.user.role,
        documentType,
        prefix,
        resolutionNumber,
        startNumber,
        endNumber,
        startDate,
        endDate,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, data, "Numbering resolution added successfully"));
});

// Alliance-wide (not scoped to a companyId) - lets an Ohnix admin browse
// validations auto-attached to iTCycle's own FirmaPass account (every
// client who bought a certificate with the coupon) and match one to the
// right Ohnix company by eye, since FirmaPass's response doesn't carry a
// confirmed field for automatic matching. See
// Backend/services/firmaPassProvisioning.service.js.
export const listFirmaPassValidationsAdmin = asyncHandler(async (req, res) => {
    const { perPage, orderNumber } = req.query || {};
    const data = await listPendingFirmaPassValidations({
        perPage: perPage ? Number(perPage) : undefined,
        orderNumber: orderNumber || undefined,
    });
    return res.status(200).json(new ApiResponse(200, data, "FirmaPass validations retrieved"));
});

export const getNextFirmaPassValidationAdmin = asyncHandler(async (req, res) => {
    // itcycle-api-dian returns 204 (no body) when the queue is empty -
    // `data` comes back null here, not an error; the response envelope
    // still resolves 200 so the frontend can distinguish "nothing pending"
    // from a real request failure.
    const data = await getNextPendingFirmaPassValidation();
    return res.status(200).json(new ApiResponse(200, data, "Next pending FirmaPass validation retrieved"));
});

export const getFirmaPassValidationDetailAdmin = asyncHandler(async (req, res) => {
    const { validationUuid } = req.params;
    const data = await getFirmaPassValidationDetail({ validationUuid });
    return res.status(200).json(new ApiResponse(200, data, "FirmaPass validation detail retrieved"));
});

export const uploadCompanyFirmaPassRutAdmin = asyncHandler(async (req, res) => {
    const { companyId, validationUuid } = req.params;
    const { rutBase64, identificacionRepresentanteLegal } = req.body || {};
    const data = await uploadCompanyFirmaPassRut({
        companyId,
        requesterRole: req.user.role,
        validationUuid,
        rutBase64,
        identificacionRepresentanteLegal,
    });
    return res.status(200).json(new ApiResponse(200, data, "RUT uploaded to FirmaPass"));
});

export const uploadCompanyFirmaPassArchivoAdmin = asyncHandler(async (req, res) => {
    const { companyId, validationUuid } = req.params;
    const { type, fileBase64 } = req.body || {};
    const data = await uploadCompanyFirmaPassArchivo({ companyId, requesterRole: req.user.role, validationUuid, type, fileBase64 });
    return res.status(200).json(new ApiResponse(200, data, "Document uploaded to FirmaPass"));
});

export const confirmCompanyFirmaPassValidationAdmin = asyncHandler(async (req, res) => {
    const { companyId, validationUuid } = req.params;
    const data = await confirmCompanyFirmaPassValidation({ companyId, requesterRole: req.user.role, validationUuid });
    return res.status(200).json(new ApiResponse(200, data, "FirmaPass validation confirmed"));
});

export const getCompanyFirmaPassStatusAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const data = await getCompanyFirmaPassStatus({ companyId, requesterRole: req.user.role });
    return res.status(200).json(new ApiResponse(200, data, "FirmaPass status retrieved"));
});

// Cross-company CertificateOrder visibility for Ohnix ops - see
// Backend/services/certificateOrder.service.js#listCertificateOrdersAdmin.
// Unlike listFirmaPassValidationsAdmin (FirmaPass's own alliance-wide queue),
// this reads Ohnix's own CertificateOrder rows, so it naturally spans every
// company already; no per-company scoping to add.
export const listCertificateOrdersAdmin = asyncHandler(async (_req, res) => {
    const data = await listCertificateOrdersAdminService();
    return res.status(200).json(new ApiResponse(200, data, "Certificate orders retrieved"));
});

// Provisions a company with NO Ohnix account (their own POS/ERP/SaaS) on
// itcycle-api-dian directly, so it can integrate against Ohnix's DIAN
// e-invoicing engine via API without ever becoming an Ohnix tenant. See
// Backend/services/externalApiClient.service.js.
export const createExternalApiClientAdmin = asyncHandler(async (req, res, next) => {
    const {
        companyName,
        taxIdentification,
        taxIdentificationDv,
        personType,
        contactName,
        contactEmail,
        contactPhone,
        notes,
    } = req.body || {};

    if (!companyName?.trim()) {
        return next(new ApiError(400, "companyName is required"));
    }
    if (!taxIdentification?.trim()) {
        return next(new ApiError(400, "taxIdentification is required"));
    }
    const normalizedDv = `${taxIdentificationDv ?? ""}`.trim();
    if (!normalizedDv) {
        return next(new ApiError(400, "taxIdentificationDv is required"));
    }
    if (!personType?.trim()) {
        return next(new ApiError(400, "personType is required"));
    }

    const client = await createExternalApiClient({
        companyName: companyName.trim(),
        taxIdentification: taxIdentification.trim(),
        taxIdentificationDv: normalizedDv,
        personType: personType.trim(),
        contactName: contactName?.trim() || null,
        contactEmail: contactEmail?.trim().toLowerCase() || null,
        contactPhone: contactPhone?.trim() || null,
        notes: notes?.trim() || null,
        createdByUserId: req.user.prismaId,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, client, "External API client created successfully"));
});

export const listExternalApiClientsAdmin = asyncHandler(async (_req, res) => {
    const data = await listExternalApiClients();
    return res.status(200).json(new ApiResponse(200, data, "External API clients retrieved"));
});

// Returns the raw itcycle-api-dian API key in the response body EXACTLY
// ONCE - see issueApiKeyForExternalClient's own comment for why it is never
// persisted anywhere in Ohnix's DB.
export const issueExternalApiClientApiKeyAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { label } = req.body || {};

    const rawKey = await issueApiKeyForExternalClient({
        externalApiClientId: id,
        label: label?.trim() || null,
        issuedByUserId: req.user.prismaId,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, { apiKey: rawKey }, "API key issued successfully"));
});

// Live cross-check against itcycle-api-dian itself (metadata only, never a
// usable key) - see listLiveApiKeysForExternalClient's own comment for why
// this exists alongside the Ohnix-side issuance log above.
export const listExternalApiClientLiveKeysAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await listLiveApiKeysForExternalClient({ externalApiClientId: id });
    return res.status(200).json(new ApiResponse(200, data, "Live API keys retrieved"));
});

// Read-only billable-usage lookup (current calendar month, ACCEPTED documents
// only) - see getUsageForExternalClient's own comment for why this exists.
export const getExternalApiClientUsageAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await getUsageForExternalClient({ externalApiClientId: id });
    return res.status(200).json(new ApiResponse(200, data, "Usage retrieved"));
});

// Generates the single-use link an admin sends (email/WhatsApp - there is no
// Ohnix account to notify) so the external client can tokenize their own
// card directly with ePayco - see createBillingEnrollmentLink's own comment.
export const createExternalApiClientBillingEnrollmentLinkAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await createBillingEnrollmentLink({ externalApiClientId: id });
    return res.status(201).json(new ApiResponse(201, data, "Billing enrollment link created"));
});

export const getExternalApiClientBillingHistoryAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await getBillingHistoryForExternalClient({ externalApiClientId: id });
    return res.status(200).json(new ApiResponse(200, data, "Billing history retrieved"));
});

// Renta/RST tax-rate tables are national law, not a per-company setting -
// see the schema comment on IncomeTaxYearConfig. Deliberately kept out of
// accounting.routes.js (which only checks a company's own team permission):
// only a real Ohnix platform admin (isAdmin, enforced by this whole router)
// may write here, since a wrong edit would corrupt every tenant's renta
// estimate at once, not just the editor's own company.
export const listIncomeTaxYearConfigsAdmin = asyncHandler(async (_req, res) => {
    const configs = await incomeTaxConfigService.listIncomeTaxYearConfigs();
    return res.status(200).json(new ApiResponse(200, configs, "Income tax year configs fetched successfully."));
});

export const upsertIncomeTaxYearConfigAdmin = asyncHandler(async (req, res) => {
    const config = await incomeTaxConfigService.upsertIncomeTaxYearConfig(req.user.prismaId, req.body || {});
    return res.status(200).json(new ApiResponse(200, config, "Income tax year config saved successfully."));
});

export const setIncomeTaxYearConfigVerifiedAdmin = asyncHandler(async (req, res) => {
    const config = await incomeTaxConfigService.setIncomeTaxYearConfigVerified(req.user.prismaId, req.params.year, req.body?.is_verified);
    return res.status(200).json(new ApiResponse(200, config, "Income tax year config status updated successfully."));
});

export const listSimpleRegimeBracketsAdmin = asyncHandler(async (req, res) => {
    const brackets = await incomeTaxConfigService.listSimpleRegimeBrackets(req.query.year);
    return res.status(200).json(new ApiResponse(200, brackets, "Simple regime brackets fetched successfully."));
});

export const upsertSimpleRegimeBracketsAdmin = asyncHandler(async (req, res) => {
    const brackets = await incomeTaxConfigService.upsertSimpleRegimeBrackets(req.user.prismaId, req.params.year, req.body?.brackets);
    return res.status(200).json(new ApiResponse(200, brackets, "Simple regime brackets saved successfully."));
});

export const setSimpleRegimeBracketsVerifiedAdmin = asyncHandler(async (req, res) => {
    const brackets = await incomeTaxConfigService.setSimpleRegimeBracketsVerified(req.user.prismaId, req.params.year, req.body?.is_verified);
    return res.status(200).json(new ApiResponse(200, brackets, "Simple regime brackets status updated successfully."));
});

export const updateCompanyLogoAdmin = asyncHandler(async (req, res, next) => {
    const { companyId } = req.params;

    if (!req.file) {
        return next(new ApiError(400, "Logo image is required"));
    }

    const existing = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, logoUrl: true },
    });

    if (!existing) {
        return next(new ApiError(404, "Company not found"));
    }

    const image = await uploadFile(req.file, {
        ownerId: companyId,
        entity: "branding",
    });
    if (!image) {
        return next(new ApiError(500, "Failed to upload logo"));
    }

    const company = await prisma.company.update({
        where: { id: companyId },
        data: { logoUrl: image.url },
        select: { id: true, logoUrl: true },
    });

    if (existing.logoUrl) {
        deleteFile(existing.logoUrl);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, company, "Company logo updated successfully"));
});
