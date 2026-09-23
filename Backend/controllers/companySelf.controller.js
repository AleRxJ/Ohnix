import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";
import { computeNitCheckDigit } from "../utils/nit.util.js";
import {
    isValidNit,
    isValidPrefix,
    isValidNumberingRange,
    isValidDateRange,
    isValidSoftwareId,
    isValidTechnicalKey,
} from "../utils/dianValidation.util.js";
import {
    addItcycleNumberingResolutionForCompany,
    updateItcycleNumberingResolutionForCompany,
    ensureElectronicInvoicingPlan,
    registerCompanyWithItcycle,
    provisionCompanyWithItcycleForCertificate,
    setCompanyItcycleDianConfiguration,
} from "../services/electronicInvoicing.service.js";
import {
    confirmCompanyFirmaPassValidation,
    getCompanyFirmaPassStatus,
    getCompanyDianReadiness,
    getCompanyFirmaPassValidationDetail,
    resolveCompanyFirmaPassOrderNumber,
    uploadCompanyCertificate,
    uploadCompanyFirmaPassArchivo,
    uploadCompanyFirmaPassRut,
} from "../services/firmaPassProvisioning.service.js";
import {
    createCompanyViafirmaRequest,
    getCompanyViafirmaCertificateStatus,
    getCompanyViafirmaKycLink,
    getCompanyViafirmaTerms,
    listCompanyViafirmaCertificates,
    listCompanyViafirmaDocuments,
    revokeCompanyViafirmaCertificate,
    uploadCompanyViafirmaDocument,
} from "../services/viafirmaProvisioning.service.js";
import {
    createOrReuseMyCertificateOrder,
    getActiveCertificateEntitlement,
    listMyCertificateOrders,
    markMyCertificateOrderPaymentFailed,
    requireActiveCertificateEntitlement,
} from "../services/certificateOrder.service.js";
import { buildCertificateOrderWidgetParams } from "../services/certificateOrderPayment.service.js";
import {
    getCompanyCertificateProviderStatus,
    setCompanyCertificateProviderOverride,
} from "../services/certificateProviderPreference.service.js";

// Same ISO-2 validator company.controller.js's admin endpoints use - kept as
// its own copy rather than a shared import since that file is entirely
// isAdmin-gated and this one deliberately isn't; duplicating six lines beats
// creating a cross-dependency between an admin-only controller and a
// customer-facing one.
const parseIsoCountryCode = (value) => {
    const normalized = `${value || ""}`.trim().toUpperCase();
    if (!normalized) return null;
    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

// Self-service counterpart to company.controller.js's *Admin functions -
// those only let an Ohnix platform admin edit a company (company.routes.js
// is entirely isAdmin-gated), so a paying customer had no way to actually
// set the logo/color/footer text the pricing page promises them. Scoped to
// req.user.prismaId's own account (owner-only via blockTeamMembers) instead
// of an arbitrary :companyId, and upserts: most self-registered users have
// no Company row at all yet (registerUser never creates one), so the first
// save here creates it and links it to the user.
const SELF_SELECT = {
    id: true,
    name: true,
    legalName: true,
    countryCode: true,
    contactEmail: true,
    phone: true,
    logoUrl: true,
    pdfFooterText: true,
    pdfAccentColor: true,
    // taxIdentification/taxIdentificationDv are readable/writable here too -
    // see updateMyCompany. Deliberately NOT electronicInvoicingEnabled or any
    // Alanube/Factus field: turning e-invoicing on involves real external
    // registration side effects (see company.controller.js), so that stays
    // admin-only. This just captures the NIT/country while the customer
    // already has it top of mind, so it doesn't have to be asked for twice.
    taxIdentification: true,
    taxIdentificationDv: true,
    electronicInvoicingEnabled: true,
    electronicInvoicingProvider: true,
    itcycleCompanyId: true,
    dianSoftwareId: true,
    itcycleTestSetId: true,
    itcyclePayrollTestSetId: true,
    vatResponsible: true,
    vatResponsibleEffectiveFrom: true,
    // Tax configuration only - no calculation reads these yet (see the
    // schema comment on Company.isWithholdingAgent). Exposed here so a
    // company can record the fact - and have their accountant confirm it -
    // ahead of the retención en la fuente / ReteICA engine existing.
    isWithholdingAgent: true,
    withholdingAgentEffectiveFrom: true,
    icaMunicipalityCode: true,
    icaActivityCode: true,
    icaRatePerThousand: true,
    // Which income-tax regime this company files under - see the schema
    // comment on TaxRegime. Same "configuration fact, no calculation
    // consequence beyond what rentaDeclaration.service.js reads" posture as
    // isWithholdingAgent above.
    taxRegime: true,
    simpleRegimeGroup: true,
};

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");
const VAT_RESPONSIBILITIES = ["unset", "responsible", "not_responsible"];
const TAX_REGIMES = ["ordinario", "simple"];
const SIMPLE_REGIME_GROUPS = ["group1", "group2", "group3", "group4"];

const DIAN_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"];

// Each company's own DIAN habilitación - see registerCompanyWithItcycle's
// comment on why this can never be a shared/default value.
const assertValidDianConfiguration = (dianConfiguration) => {
    if (!DIAN_ENVIRONMENTS.includes(dianConfiguration?.environment)) {
        throw new ApiError(400, "El ambiente DIAN debe ser SANDBOX o PRODUCTION.");
    }
    if (!isValidSoftwareId(dianConfiguration?.softwareId)) {
        throw new ApiError(400, "El ID de software DIAN debe ser el UUID que la DIAN te entregó al habilitarte.");
    }
    if (!`${dianConfiguration?.softwarePin || ""}`.trim()) {
        throw new ApiError(400, "El PIN de software DIAN es obligatorio.");
    }
    if (!isValidTechnicalKey(dianConfiguration?.technicalKey)) {
        throw new ApiError(400, "La clave técnica debe ser el valor de 40 caracteres hexadecimales que entrega la DIAN.");
    }
};

const assertValidNumberingResolution = (resolution) => {
    if (!isValidPrefix(resolution?.prefix)) {
        throw new ApiError(400, "El prefijo de la resolución debe tener máximo 4 caracteres (letras o números), tal como lo autorizó la DIAN.");
    }
    if (!`${resolution?.resolutionNumber || ""}`.trim()) {
        throw new ApiError(400, "El número de resolución es obligatorio.");
    }
    if (!isValidNumberingRange(resolution?.startNumber, resolution?.endNumber)) {
        throw new ApiError(400, "El rango de numeración no es válido: el número final debe ser mayor al inicial.");
    }
    if (!isValidDateRange(resolution?.startDate, resolution?.endDate)) {
        throw new ApiError(400, "El período de vigencia de la resolución no es válido: la fecha final debe ser posterior a la inicial.");
    }
};

// Never accept a company id from a self-service request. A company owner can
// only configure the company linked to their authenticated account.
const getOwnedCompanyOrThrow = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });
    if (!user?.companyId) {
        throw new ApiError(422, "Configura primero los datos de tu empresa antes de activar facturación electrónica.");
    }
    const company = await prisma.company.findUnique({ where: { id: user.companyId}, select: SELF_SELECT });
    if (!company) throw new ApiError(404, "Empresa no encontrada.");
    return company;
};

export const getMyItcycleStatus = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);

    // A transient itcycle-api-dian failure (Render free-tier cold start,
    // a deploy in progress, a brief network blip) must never make an
    // ALREADY-registered company look unregistered again - that would send
    // a real customer back to the initial registration wizard, which then
    // rejects them with 409 "ya está configurada" if they try to resubmit.
    // Only the readiness projection itself is unknown here, never the
    // registration fact (which is Ohnix's own stored itcycleCompanyId).
    let readiness = null;
    let readinessError = null;
    if (company.itcycleCompanyId) {
        try {
            readiness = await getCompanyDianReadiness({ companyId: company.id });
        } catch (error) {
            readinessError = error.message || "No fue posible verificar el estado ante itcycle-api-dian.";
        }
    }

    // company.electronicInvoicingEnabled is a one-way flag flipped by
    // activateMyItcycleElectronicInvoicing and never revisited afterward - if
    // the certificate later expires/is revoked, or a resolution runs out of
    // range, `readiness` (fetched live above) stops matching it. Surfacing
    // that divergence here is the only way the settings screen can warn
    // instead of showing a stale "activa" success message next to a
    // FirmaPass card that's live-checking the same certificate and already
    // says "Pendiente". Only meaningful when readiness was actually fetched -
    // a transient itcycle-api-dian failure (readinessError set) must not be
    // read as "at risk", it's just unknown for now.
    const electronicInvoicingAtRisk = Boolean(
        company.electronicInvoicingEnabled && readiness && !readiness.canIssueInvoices
    );

    return res.status(200).json(
        new ApiResponse(200, {
            provisioned: Boolean(company.itcycleCompanyId),
            itcycleCompanyId: company.itcycleCompanyId,
            // Set by an admin during provisioning/support (never self-service
            // yet) whenever DIAN's own habilitación is still "En proceso" -
            // see buildItcycleSendOptions (electronicInvoicing.service.js).
            // Surfaced so DianHabilitacionPanel.jsx can pre-fill the testSetId
            // field instead of asking the owner to go find it again in DIAN's
            // portal when Ohnix already has it on file.
            itcycleTestSetId: company.itcycleTestSetId,
            // Nómina's own, separate habilitación testSetId - see
            // Company.itcyclePayrollTestSetId's schema comment for why this
            // can't just reuse itcycleTestSetId above.
            itcyclePayrollTestSetId: company.itcyclePayrollTestSetId,
            electronicInvoicingEnabled: company.electronicInvoicingEnabled,
            electronicInvoicingAtRisk,
            electronicInvoicingProvider: company.electronicInvoicingProvider,
            readiness,
            readinessError,
        }, "Estado de facturación electrónica obtenido correctamente")
    );
});

// Which certificate provider (firmapass|viafirma) signs this company's real
// documents - only meaningful (and only shown by the Frontend as a
// selector) when activeProviders has more than one entry, i.e. this company
// has an ACTIVE certificate from both at once.
export const getMyCertificateProviderStatus = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    if (!company.itcycleCompanyId) {
        return res.status(200).json(new ApiResponse(200, { activeProviders: [], override: null }, "Sin proveedor de certificado configurado todavía"));
    }
    const data = await getCompanyCertificateProviderStatus({ companyId: company.id });
    return res.status(200).json(new ApiResponse(200, data, "Preferencia de proveedor de certificado obtenida"));
});

export const setMyCertificateProviderOverride = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { provider } = req.body || {};
    if (provider !== null && provider !== "firmapass" && provider !== "viafirma") {
        throw new ApiError(400, "provider debe ser 'firmapass', 'viafirma' o null");
    }
    const data = await setCompanyCertificateProviderOverride({ companyId: company.id, provider });
    return res.status(200).json(new ApiResponse(200, data, "Preferencia de proveedor de certificado actualizada"));
});

export const activateMyItcycleElectronicInvoicing = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    if (!company.itcycleCompanyId) {
        throw new ApiError(422, "Configura primero tu empresa en itcycle-api-dian.");
    }

    const readiness = await getCompanyDianReadiness({ companyId: company.id });
    if (!readiness?.canIssueInvoices) {
        // `missing` codes (e.g. "invoice_resolution_01") are itcycle-api-dian's
        // internal vocabulary, meaningless to a business owner - pass them via
        // `errors` (same structured-list pattern as insufficient-stock errors)
        // so the frontend translates each one, instead of baking raw codes
        // into `message` where they'd leak straight into a toast.
        throw new ApiError(422, "Tu empresa todavía no está lista para emitir.", readiness?.missing || []);
    }

    const updated = await prisma.company.update({
        where: { id: company.id },
        data: { electronicInvoicingProvider: "itcycle", electronicInvoicingEnabled: true },
        select: SELF_SELECT,
    });
    return res.status(200).json(new ApiResponse(200, updated, "Facturación electrónica activada correctamente"));
});

export const registerMyCompanyWithItcycle = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    if (company.itcycleCompanyId) {
        throw new ApiError(409, "Tu empresa ya está configurada para facturar. Agrega una resolución por separado si la necesitas.");
    }
    // Legacy provider values may remain until the normalization migration is
    // deployed. They never block provisioning: itcycle is Ohnix's only
    // operational issuer and registration normalizes the company to it.
    //
    // No plan gate here (product decision, 2026-09): this is also the only
    // way to obtain an itcycleCompanyId, which every certificate flow below
    // requires - a company that only wants a digital certificate (no
    // invoicing) must still be able to reach this step on any plan. Actually
    // ISSUING invoices stays gated at activateMyItcycleElectronicInvoicing
    // and at numbering-resolution management below, so this alone doesn't
    // unlock paid invoicing - a Starter company can register + hold a
    // certificate but still can't flip electronicInvoicingEnabled on.
    const { dianConfiguration, supplierProfile, numberingResolutions, certificate } = req.body || {};
    assertValidDianConfiguration(dianConfiguration);
    for (const resolution of numberingResolutions || []) assertValidNumberingResolution(resolution);
    const data = await registerCompanyWithItcycle({
        companyId: company.id,
        dianConfiguration,
        supplierProfile,
        numberingResolutions,
        certificate,
    });
    return res.status(200).json(new ApiResponse(200, data, "Empresa configurada para facturación electrónica"));
});

// Lite counterpart to registerMyCompanyWithItcycle: provisions the company in
// itcycle-api-dian (companyId + API key) without requiring any
// DianConfiguration up front - for someone who "just wants a certificate"
// and has never gone through DIAN's own habilitación (see
// provisionCompanyWithItcycleForCertificate's own comment).
//
// No plan gate here either (same product decision, 2026-09, as
// registerMyCompanyWithItcycle above): this is also a way to obtain an
// itcycleCompanyId, which every certificate flow requires - a company that
// only wants a digital certificate (no invoicing) must still be able to
// reach this on any plan. Actually issuing invoices stays gated at
// activateMyItcycleElectronicInvoicing and numbering-resolution management.
export const provisionMyCompanyForCertificate = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await provisionCompanyWithItcycleForCertificate({ companyId: company.id });
    return res.status(200).json(new ApiResponse(200, data, "Empresa configurada para emitir certificado digital"));
});

// Fills in DianConfiguration later, once the company actually has its DIAN
// habilitación credentials - whether it registered via the lite certificate
// path above or just wants to (re)set its configuration. No plan gate:
// setting credentials doesn't cost anything or unlock invoicing by itself -
// activateMyItcycleElectronicInvoicing and numbering-resolution management
// stay the only Negocio-gated actions.
export const setMyItcycleDianConfiguration = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { dianConfiguration, supplierProfile } = req.body || {};
    assertValidDianConfiguration(dianConfiguration);
    const data = await setCompanyItcycleDianConfiguration({
        companyId: company.id,
        requesterRole: req.user.role,
        dianConfiguration,
        supplierProfile,
    });
    return res.status(200).json(new ApiResponse(200, data, "Configuración DIAN actualizada correctamente"));
});

export const addMyItcycleNumberingResolution = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    assertValidNumberingResolution(req.body || {});
    const data = await addItcycleNumberingResolutionForCompany({ companyId: company.id, ...(req.body || {}) });
    return res.status(201).json(new ApiResponse(201, data, "Resolución agregada correctamente"));
});

// Correction, not a partial PATCH - the edit form always resends every
// field (pre-filled with the current values), so this reuses the same
// full-shape validator as add. updateItcycleNumberingResolutionForCompany
// itself restricts this to "91"/"92" (nota crédito/débito - see that
// function's comment) and itcycle-api-dian additionally refuses it once any
// document has claimed a number from the resolution.
export const updateMyItcycleNumberingResolution = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    assertValidNumberingResolution(req.body || {});
    const data = await updateItcycleNumberingResolutionForCompany({
        companyId: company.id,
        resolutionId: req.params.resolutionId,
        ...(req.body || {}),
    });
    return res.status(200).json(new ApiResponse(200, data, "Resolución actualizada correctamente"));
});

// No plan gate on this or the FirmaPass wizard steps below (registerMyCompanyWithItcycle's
// own comment has the full reasoning): a digital certificate is sold and paid
// for on its own (requireActiveCertificateEntitlement, in createMyViafirmaRequest
// below) independently of the Negocio plan.
export const resolveMyFirmaPassOrderNumber = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const orderNumber = `${req.params.orderNumber || ""}`.trim();
    if (!orderNumber) throw new ApiError(400, "El número de orden es obligatorio.");
    const data = await resolveCompanyFirmaPassOrderNumber({ companyId: company.id, orderNumber });
    return res.status(200).json(new ApiResponse(200, data, "Validación de FirmaPass encontrada"));
});

// Drives the step-by-step self-service UI: FirmaPass's own
// pending_documents/uploaded_documents on a validation tell the client
// exactly what's left (rut, cc, ccio, etc. - each with its own label from
// FirmaPass, not a generic "additional document" guess) - see
// FirmaPassSelfService.jsx. Uses the company-scoped service function (not
// the admin one), which enforces that this validationUuid actually belongs
// to the caller's own company - FirmaPass's API has no such scoping itself.
export const getMyFirmaPassValidationDetail = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await getCompanyFirmaPassValidationDetail({ companyId: company.id, validationUuid: req.params.validationUuid });
    return res.status(200).json(new ApiResponse(200, data, "Validación de FirmaPass obtenida"));
});

export const uploadMyFirmaPassRut = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await uploadCompanyFirmaPassRut({ companyId: company.id, validationUuid: req.params.validationUuid, ...(req.body || {}) });
    return res.status(200).json(new ApiResponse(200, data, "RUT enviado a FirmaPass"));
});

export const uploadMyFirmaPassArchivo = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await uploadCompanyFirmaPassArchivo({ companyId: company.id, validationUuid: req.params.validationUuid, ...(req.body || {}) });
    return res.status(200).json(new ApiResponse(200, data, "Documento enviado a FirmaPass"));
});

export const confirmMyFirmaPassValidation = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await confirmCompanyFirmaPassValidation({ companyId: company.id, validationUuid: req.params.validationUuid });
    return res.status(200).json(new ApiResponse(200, data, "Validación de FirmaPass confirmada"));
});

// Alternative to the rut/archivos/confirmar wizard above: the company
// already has a finished digital certificate (bought elsewhere, or a
// FirmaPass one obtained outside this coupon flow) and just wants to hand
// it to itcycle-api-dian directly. See uploadCompanyCertificate's own
// comment for why this needs its own endpoint instead of reusing
// registerMyCompanyWithItcycle's one-shot `certificate` param.
export const uploadMyCertificate = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { provider, certificateIdentifier, p12Base64, password, expiresAt } = req.body || {};
    const data = await uploadCompanyCertificate({ companyId: company.id, provider, certificateIdentifier, p12Base64, password, expiresAt });
    return res.status(200).json(new ApiResponse(200, data, "Certificado cargado correctamente"));
});

export const getMyFirmaPassStatus = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    if (!company.itcycleCompanyId) {
        return res.status(200).json(new ApiResponse(200, { provisioned: false, certificates: [] }, "FirmaPass aún no está disponible"));
    }
    // Same reasoning as getMyItcycleStatus - a transient itcycle-api-dian
    // failure must not throw the whole request away, it just means the
    // FirmaPass certificate list is momentarily unknown.
    try {
        const data = await getCompanyFirmaPassStatus({ companyId: company.id });
        return res.status(200).json(new ApiResponse(200, { provisioned: true, ...data }, "Estado de FirmaPass obtenido correctamente"));
    } catch (error) {
        return res.status(200).json(
            new ApiResponse(200, { provisioned: true, certificates: [], statusError: error.message || "No fue posible verificar el estado ante itcycle-api-dian." }, "Estado de FirmaPass obtenido parcialmente")
        );
    }
});

// Viafirma Colombia digital-certificate issuance (see
// services/viafirmaProvisioning.service.js). Unlike the FirmaPass wizard,
// there is no pre-existing validation to discover first - the CSR/keypair
// are generated server-side, in itcycle-api-dian, by this one call.
// CEA-3.0-07 art. 10.11.1.e - the profile's terms/conditions must be shown
// and explicitly accepted before a request can be submitted; itcycle-api-dian
// enforces this again server-side (createViafirmaRequest, Zod schema), this
// is just a friendlier 400 instead of a 502-wrapped provider error.
export const getMyViafirmaTerms = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { profileKind } = req.query || {};
    if (profileKind !== "FE-PJ" && profileKind !== "FE-PN") {
        throw new ApiError(400, "profileKind debe ser FE-PJ o FE-PN");
    }
    const data = await getCompanyViafirmaTerms({ companyId: company.id, profileKind });
    return res.status(200).json(new ApiResponse(200, data, "Términos y condiciones obtenidos"));
});

export const createMyViafirmaRequest = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    // DIAN-mandatory: the certificate must be paid for before it can be
    // requested - see CertificateOrder's own doc comment in schema.prisma.
    // Checked here (not deeper in viafirmaProvisioning.service.js) so it
    // gates the one action that actually costs Ohnix a Viafirma consumption
    // unit. This is the ONLY gate on this endpoint (no plan check, product
    // decision 2026-09 - see registerMyCompanyWithItcycle's comment): a paid
    // certificate entitlement already covers that cost, independently of
    // whether the company subscribes to Negocio.
    await requireActiveCertificateEntitlement({ companyId: company.id });
    const { profileKind, subject, identityType, countryCode, identity, emailCertificate, organizationType, termsAccepted } = req.body || {};
    if (termsAccepted !== true) {
        throw new ApiError(400, "Debes aceptar los términos y condiciones para solicitar el certificado");
    }
    // Same convention as updateMyCompany's taxIdentificationDv: a user typing
    // their NIT fresh only ever types the bare number, never the check digit
    // - it's always derived. But ViafirmaSelfService.jsx's own nit field
    // sends the FULL "NIT-DV" string already (registeredNit) whenever the
    // company's NIT is already registered with Ohnix - appending another
    // computed digit on top of that produced "901836726-5-4" (a real
    // production incident, 2026-09-08: Viafirma's own SERIALNUMBER format
    // "^\d{5,12}(-\d{1})?$" doesn't allow a second "-N" suffix, so the
    // request was accepted but the issuance itself failed silently). Only
    // append when `nit` doesn't already end in "-<digit>".
    const normalizedSubject =
        profileKind === "FE-PJ" && subject?.nit && !/-\d$/.test(subject.nit)
            ? { ...subject, nit: `${subject.nit}-${computeNitCheckDigit(subject.nit)}` }
            : subject;
    const data = await createCompanyViafirmaRequest({
        companyId: company.id,
        profileKind,
        subject: normalizedSubject,
        identityType,
        countryCode,
        identity,
        emailCertificate,
        organizationType,
        termsAccepted,
    });
    return res.status(201).json(new ApiResponse(201, data, "Solicitud de certificado Viafirma creada"));
});

// GET /company/me/itcycle/viafirma/certificate-orders
// Lists this company's certificate purchases and whether an active
// (paid, unexpired) entitlement currently exists - the paywall in
// ViafirmaSelfService.jsx reads `activeEntitlement` to decide whether to
// show the certificate-request form or the "pay first" screen.
export const getMyCertificateOrders = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    // getActiveCertificateEntitlement resolves every pending order against
    // ePayco first (see its own doc comment) - sequenced before the list
    // read below, not run in parallel with it, so a webhook that never
    // arrived doesn't leave this response showing stale "pending" rows.
    const activeEntitlement = await getActiveCertificateEntitlement({ companyId: company.id });
    const orders = await listMyCertificateOrders({ companyId: company.id });
    return res.status(200).json(new ApiResponse(200, { orders, activeEntitlement }, "Órdenes de certificado obtenidas"));
});

// POST /company/me/itcycle/viafirma/certificate-orders/:orderId/epayco-reference
// Same purpose/trust-model as subscription.controller.js#reportEpaycoTransactionReference:
// the client-side ePayco widget's onResponse callback knows the real
// ref_payco immediately, before any server-to-server webhook - which
// simply cannot reach a localhost/private dev server, and can miss a
// Render cold start even in production. This only ever fills in
// paymentSessionId (still our own placeholder) so the trusted live-query
// fallback (resolvePendingCertificateOrderPaymentStatus) has a real
// reference to check; it never itself activates anything.
export const reportMyCertificateOrderTransactionReference = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { orderId } = req.params;
    const refPayco = `${req.body?.refPayco || ""}`.trim();

    if (!refPayco) {
        return res.status(200).json(new ApiResponse(200, { updated: false }, "No reference provided"));
    }

    const order = await prisma.certificateOrder.findFirst({
        where: { id: orderId, companyId: company.id },
        select: { id: true, paymentStatus: true, paymentSessionId: true },
    });
    if (!order) throw new ApiError(404, "Certificate order not found");

    const stillUntouchedPlaceholder = `${order.paymentSessionId || ""}`.startsWith(`OHNIX-CERT-${orderId}-`);
    if (order.paymentStatus !== "pending" || !stillUntouchedPlaceholder) {
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Nothing to update"));
    }

    const alreadyConsumedBy = await prisma.certificateOrder.findFirst({
        where: { paymentSessionId: refPayco, paymentStatus: "paid", NOT: { id: orderId } },
        select: { id: true },
    });
    if (alreadyConsumedBy) {
        console.warn("[certificate-order-reference] Rejected reused ref_payco", { orderId, refPayco });
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Reference already in use"));
    }

    await prisma.certificateOrder.updateMany({
        where: { id: orderId, paymentStatus: "pending", paymentSessionId: order.paymentSessionId },
        data: { paymentSessionId: refPayco },
    });
    return res.status(200).json(new ApiResponse(200, { updated: true }, "Reference recorded"));
});

// POST /company/me/itcycle/viafirma/certificate-orders/:orderId/epayco-checkout-closed
// Same purpose/safety model as subscription.controller.js#reportEpaycoCheckoutClosed:
// a self-reported "the customer closed the ePayco checkout without
// finishing" signal, sent by CertificateOrderCheckout.jsx's onClosed hook
// and its pagehide/sendBeacon fallback. Not a source of truth - only ever
// moves a pending order the caller owns to "cancelled", never "paid" - so
// it's just a fast-path around the 48h PENDING_ORDER_TIMEOUT_MS backstop,
// not a way to grant anything.
export const reportMyCertificateOrderCheckoutClosed = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { orderId } = req.params;

    const order = await prisma.certificateOrder.findFirst({
        where: { id: orderId, companyId: company.id },
        select: { id: true, paymentStatus: true },
    });
    if (!order) throw new ApiError(404, "Certificate order not found");

    if (order.paymentStatus !== "pending") {
        return res.status(200).json(new ApiResponse(200, { updated: false }, "Nothing to update"));
    }

    await markMyCertificateOrderPaymentFailed({ orderId, paymentStatus: "cancelled" });
    return res.status(200).json(new ApiResponse(200, { updated: true }, "Checkout marked as cancelled"));
});

// POST /company/me/itcycle/viafirma/certificate-orders
// Creates (or reuses an already-pending) CertificateOrder for the chosen
// duration - does NOT charge anything by itself, only sets up the ePayco
// checkout session the frontend then opens (see getMyCertificateOrderCheckoutParams).
export const createMyCertificateOrder = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const durationYears = Number(req.body?.durationYears);
    const order = await createOrReuseMyCertificateOrder({
        companyId: company.id,
        requestedByUserId: req.user.prismaId,
        durationYears,
    });
    return res.status(201).json(new ApiResponse(201, order, "Orden de certificado creada"));
});

// GET /company/me/itcycle/viafirma/certificate-orders/:orderId/epayco-params
// Same shape/purpose as subscription.controller.js#getEpaycoCheckoutParams,
// scoped to a CertificateOrder instead of a PlanUpgradeRequest.
export const getMyCertificateOrderCheckoutParams = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const order = await prisma.certificateOrder.findFirst({
        where: { id: req.params.orderId, companyId: company.id },
    });
    if (!order) throw new ApiError(404, "Certificate order not found");
    if (order.paymentStatus !== "pending" || !order.paymentSessionId) {
        throw new ApiError(409, "Checkout is only available for a pending certificate order");
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.prismaId }, select: { email: true } });
    if (!user?.email) throw new ApiError(400, "A valid account email is required");

    const params = buildCertificateOrderWidgetParams({ order, user, reference: order.paymentSessionId });
    return res.status(200).json(new ApiResponse(200, params, "ePayco checkout params fetched successfully"));
});

export const getMyViafirmaCertificates = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    if (!company.itcycleCompanyId) {
        return res.status(200).json(new ApiResponse(200, { provisioned: false, certificates: [] }, "Viafirma aún no está disponible"));
    }
    try {
        const data = await listCompanyViafirmaCertificates({ companyId: company.id });
        return res.status(200).json(new ApiResponse(200, { provisioned: true, certificates: data }, "Certificados Viafirma obtenidos"));
    } catch (error) {
        return res.status(200).json(
            new ApiResponse(200, { provisioned: true, certificates: [], statusError: error.message || "No fue posible verificar el estado ante itcycle-api-dian." }, "Certificados Viafirma obtenidos parcialmente")
        );
    }
});

export const getMyViafirmaCertificateStatus = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await getCompanyViafirmaCertificateStatus({ companyId: company.id, certificateId: req.params.certificateId });
    return res.status(200).json(new ApiResponse(200, data, "Estado del certificado Viafirma obtenido"));
});

// Only meaningful while status is "awaiting_identity_verification" (Viafirma's
// `accreditation`) - propagates itcycle-api-dian's own error otherwise
// (Viafirma returns link_not_generated for any other status).
export const getMyViafirmaKycLink = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await getCompanyViafirmaKycLink({ companyId: company.id, certificateId: req.params.certificateId });
    return res.status(200).json(new ApiResponse(200, data, "Enlace de verificación de identidad obtenido"));
});

export const uploadMyViafirmaDocument = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { name, base64 } = req.body || {};
    const data = await uploadCompanyViafirmaDocument({ companyId: company.id, certificateId: req.params.certificateId, name, base64 });
    return res.status(201).json(new ApiResponse(201, data, "Documento enviado a Viafirma"));
});

export const listMyViafirmaDocuments = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await listCompanyViafirmaDocuments({ companyId: company.id, certificateId: req.params.certificateId });
    return res.status(200).json(new ApiResponse(200, data, "Documentos de Viafirma obtenidos"));
});

export const revokeMyViafirmaCertificate = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const { reason } = req.body || {};
    const data = await revokeCompanyViafirmaCertificate({ companyId: company.id, certificateId: req.params.certificateId, reason });
    return res.status(200).json(new ApiResponse(200, data, "Certificado Viafirma revocado"));
});

export const getMyCompany = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { companyId: true },
    });

    const company = user?.companyId
        ? await prisma.company.findUnique({ where: { id: user.companyId }, select: SELF_SELECT })
        : null;

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const effectivePlan = getEffectivePlan(subscription);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                company,
                // Mirrors the exact gates order.controller.js's generateInvoice
                // applies when it renders the PDF - what you can configure here
                // must stay in lockstep with what actually shows up on the
                // document, so this reads the same effectivePlan comparisons
                // rather than a separate feature flag that could drift.
                canUploadLogo: effectivePlan !== "starter",
                canCustomizeBranding: ["scale", "enterprise"].includes(effectivePlan),
            },
            "Company fetched successfully"
        )
    );
});

export const updateMyCompany = asyncHandler(async (req, res, next) => {
    const {
        name,
        legalName,
        contactEmail,
        phone,
        pdfFooterText,
        pdfAccentColor,
        taxIdentification,
        countryCode,
        vatResponsible,
        isWithholdingAgent,
        icaMunicipalityCode,
        icaActivityCode,
        icaRatePerThousand,
        taxRegime,
        simpleRegimeGroup,
    } = req.body || {};

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const effectivePlan = getEffectivePlan(subscription);
    const canCustomizeBranding = ["scale", "enterprise"].includes(effectivePlan);

    if ((pdfFooterText !== undefined || pdfAccentColor !== undefined) && !canCustomizeBranding) {
        return next(
            new ApiError(403, "La personalización del PDF (color de marca y pie de página) está disponible desde el plan Escala.")
        );
    }

    const trimmedAccentColor = pdfAccentColor?.trim();
    if (trimmedAccentColor && !isValidHexColor(trimmedAccentColor)) {
        return next(new ApiError(400, "pdfAccentColor debe ser un color hexadecimal, ej. #29D8D5"));
    }

    const hasExplicitCountry = countryCode !== undefined && `${countryCode || ""}`.trim() !== "";
    const normalizedCountryCode = parseIsoCountryCode(countryCode);
    if (hasExplicitCountry && !normalizedCountryCode) {
        return next(new ApiError(400, "countryCode debe ser un código ISO-2 válido, ej. CO"));
    }

    const normalizedVatResponsible = vatResponsible !== undefined ? `${vatResponsible || ""}`.trim() : undefined;
    if (normalizedVatResponsible !== undefined && !VAT_RESPONSIBILITIES.includes(normalizedVatResponsible)) {
        return next(new ApiError(400, "vatResponsible debe ser responsible, not_responsible o unset."));
    }

    const trimmedTaxId = taxIdentification !== undefined ? `${taxIdentification || ""}`.replace(/[^0-9]/g, "") : undefined;
    if (taxIdentification !== undefined && taxIdentification && !isValidNit(trimmedTaxId)) {
        return next(new ApiError(400, "El NIT debe tener entre 6 y 15 dígitos."));
    }

    if (isWithholdingAgent !== undefined && typeof isWithholdingAgent !== "boolean") {
        return next(new ApiError(400, "isWithholdingAgent debe ser verdadero o falso."));
    }

    const trimmedIcaMunicipalityCode = icaMunicipalityCode !== undefined ? `${icaMunicipalityCode || ""}`.replace(/[^0-9]/g, "") : undefined;
    if (trimmedIcaMunicipalityCode && !/^\d{5}$/.test(trimmedIcaMunicipalityCode)) {
        return next(new ApiError(400, "icaMunicipalityCode debe ser el código DANE de 5 dígitos del municipio."));
    }

    const trimmedIcaActivityCode = icaActivityCode !== undefined ? `${icaActivityCode || ""}`.replace(/[^0-9]/g, "") : undefined;
    if (trimmedIcaActivityCode && !/^\d{4}$/.test(trimmedIcaActivityCode)) {
        return next(new ApiError(400, "icaActivityCode debe ser el código CIIU de 4 dígitos de la actividad económica."));
    }

    const parsedIcaRate = icaRatePerThousand !== undefined && icaRatePerThousand !== null && icaRatePerThousand !== ""
        ? Number(icaRatePerThousand)
        : icaRatePerThousand;
    if (icaRatePerThousand !== undefined && icaRatePerThousand !== null && icaRatePerThousand !== "" && (!Number.isFinite(parsedIcaRate) || parsedIcaRate < 0 || parsedIcaRate > 50)) {
        return next(new ApiError(400, "icaRatePerThousand debe ser un número entre 0 y 50 (tarifa por mil)."));
    }

    if (taxRegime !== undefined && taxRegime !== null && !TAX_REGIMES.includes(taxRegime)) {
        return next(new ApiError(400, "taxRegime debe ser ordinario o simple."));
    }
    if (simpleRegimeGroup !== undefined && simpleRegimeGroup !== null && !SIMPLE_REGIME_GROUPS.includes(simpleRegimeGroup)) {
        return next(new ApiError(400, "simpleRegimeGroup debe ser group1, group2, group3 o group4."));
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: {
            companyId: true,
            username: true,
            company: (trimmedTaxId && !hasExplicitCountry) || normalizedVatResponsible !== undefined || isWithholdingAgent !== undefined
                ? { select: { countryCode: true, vatResponsible: true, isWithholdingAgent: true, itcycleCompanyId: true, legalName: true, taxIdentification: true } }
                : { select: { itcycleCompanyId: true, legalName: true, taxIdentification: true } },
        },
    });

    // legalName/taxIdentification are frozen into itcycle-api-dian's own
    // DianConfiguration.supplierProfile the moment registerMyCompanyWithItcycle
    // runs (see that function's comment: the supplier/emisor party is never
    // resent per invoice, only built once at provisioning time). Letting this
    // endpoint silently accept a new value afterward would desync Ohnix's
    // display from what DIAN actually has on file for that NIT - every future
    // invoice would keep printing the OLD name/NIT forever with no visible
    // sign anything is wrong. A real correction needs a human to also push
    // the change to itcycle-api-dian (and possibly re-register resolutions),
    // so this stays a support-mediated action, not self-service. Compared
    // against the stored value (not just "was the field present") because
    // SettingsTab's branding card always resubmits legalName as part of its
    // payload even when the owner only touched an unrelated field like phone.
    const legalNameChanged = legalName !== undefined && (legalName?.trim() || null) !== (user?.company?.legalName || null);
    const taxIdentificationChanged = trimmedTaxId !== undefined && (trimmedTaxId || null) !== (user?.company?.taxIdentification || null);
    if (user?.company?.itcycleCompanyId && (legalNameChanged || taxIdentificationChanged)) {
        return next(new ApiError(409, "La razón social y el NIT ya quedaron registrados ante la DIAN a través de itcycle-api-dian. Para corregirlos contacta a soporte."));
    }

    // The DIAN check digit only means anything for a Colombian NIT. If this
    // request didn't also (re-)state countryCode, fall back to the
    // company's own already-stored value (existing company) rather than
    // assuming "CO" - only a brand-new company with no country on record
    // yet defaults there, matching Ohnix's Colombia-first design elsewhere.
    const effectiveCountryForDv = hasExplicitCountry
        ? normalizedCountryCode
        : user?.company?.countryCode || "CO";

    const data = {
        ...(legalName !== undefined ? { legalName: legalName?.trim() || null } : {}),
        ...(contactEmail !== undefined ? { contactEmail: contactEmail?.trim().toLowerCase() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(pdfFooterText !== undefined ? { pdfFooterText: pdfFooterText?.trim() || null } : {}),
        ...(pdfAccentColor !== undefined ? { pdfAccentColor: trimmedAccentColor || null } : {}),
        ...(countryCode !== undefined ? { countryCode: hasExplicitCountry ? normalizedCountryCode : null } : {}),
        ...(normalizedVatResponsible !== undefined
            ? {
                  vatResponsible: normalizedVatResponsible,
                  ...(normalizedVatResponsible !== user?.company?.vatResponsible
                      ? { vatResponsibleEffectiveFrom: normalizedVatResponsible === "unset" ? null : new Date() }
                      : {}),
              }
            : {}),
        ...(isWithholdingAgent !== undefined
            ? {
                  isWithholdingAgent,
                  ...(isWithholdingAgent !== user?.company?.isWithholdingAgent
                      ? { withholdingAgentEffectiveFrom: isWithholdingAgent ? new Date() : null }
                      : {}),
              }
            : {}),
        ...(icaMunicipalityCode !== undefined ? { icaMunicipalityCode: trimmedIcaMunicipalityCode || null } : {}),
        ...(icaActivityCode !== undefined ? { icaActivityCode: trimmedIcaActivityCode || null } : {}),
        ...(icaRatePerThousand !== undefined ? { icaRatePerThousand: parsedIcaRate === "" || parsedIcaRate === null ? null : parsedIcaRate } : {}),
        ...(taxRegime !== undefined ? { taxRegime: taxRegime || null } : {}),
        // Only meaningful under RST - switching taxRegime away from `simple`
        // (or clearing it) drops any previously-selected group so a stale
        // selection never lingers once it stops applying.
        ...(taxRegime !== undefined && taxRegime !== "simple"
            ? { simpleRegimeGroup: null }
            : simpleRegimeGroup !== undefined
            ? { simpleRegimeGroup: simpleRegimeGroup || null }
            : {}),
        // For any other country this just stores the raw identifier with no
        // computed digit, same as company.controller.js's admin path leaves
        // it to be set explicitly there.
        ...(trimmedTaxId !== undefined
            ? {
                  taxIdentification: trimmedTaxId || null,
                  taxIdentificationDv:
                      trimmedTaxId && effectiveCountryForDv === "CO" ? computeNitCheckDigit(trimmedTaxId) : null,
              }
            : {}),
    };

    let company;
    if (user?.companyId) {
        if (name?.trim()) {
            const collision = await prisma.company.findFirst({
                where: { id: { not: user.companyId }, name: { equals: name.trim(), mode: "insensitive" } },
                select: { id: true },
            });
            if (collision) {
                return next(new ApiError(409, "Ya existe otra empresa con ese nombre."));
            }
            data.name = name.trim();
        }
        company = await prisma.company.update({ where: { id: user.companyId }, data, select: SELF_SELECT });
    } else {
        if (!name?.trim()) {
            return next(new ApiError(400, "El nombre de la empresa es obligatorio."));
        }
        const collision = await prisma.company.findFirst({
            where: { name: { equals: name.trim(), mode: "insensitive" } },
            select: { id: true },
        });
        if (collision) {
            return next(new ApiError(409, "Ya existe otra empresa con ese nombre."));
        }

        company = await prisma.company.create({
            data: { name: name.trim(), isActive: true, ...data },
            select: SELF_SELECT,
        });
        await prisma.user.update({ where: { id: req.user.prismaId }, data: { companyId: company.id } });
    }

    return res.status(200).json(new ApiResponse(200, company, "Empresa actualizada correctamente"));
});

export const updateMyCompanyLogo = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new ApiError(400, "La imagen del logo es obligatoria."));
    }

    const subscription = await ensureUserSubscription(req.user.prismaId);
    const effectivePlan = getEffectivePlan(subscription);
    if (effectivePlan === "starter") {
        return next(new ApiError(403, "El logo en el PDF está disponible desde el plan Negocio."));
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { companyId: true, username: true },
    });

    // No creating a bare placeholder Company here anymore - Facturación
    // electrónica (registerMyCompanyWithItcycle's updateMyCompany call) is
    // now the only place a Company row gets born, with real NIT/legal data
    // instead of just a logo and the username as its name.
    if (!user?.companyId) {
        return next(new ApiError(422, "Primero completa la configuración de tu empresa en Facturación electrónica."));
    }

    const image = await uploadFile(req.file, {
        ownerId: user.companyId,
        entity: "branding",
    });
    if (!image) {
        return next(new ApiError(500, "No se pudo subir el logo."));
    }

    const companyId = user.companyId;
    const previous = await prisma.company.findUnique({
        where: { id: companyId },
        select: { logoUrl: true },
    });
    await prisma.company.update({ where: { id: companyId }, data: { logoUrl: image.url } });
    if (previous?.logoUrl) {
        deleteFile(previous.logoUrl);
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: SELF_SELECT });
    return res.status(200).json(new ApiResponse(200, company, "Logo actualizado correctamente"));
});

// Reset-to-default counterpart to updateMyCompanyLogo - no plan gate, since
// removing a logo (falling back to the generic Ohnix template) must stay
// available even to a company that downgraded below the plan that let it
// upload one in the first place.
export const deleteMyCompanyLogo = asyncHandler(async (req, res, next) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { companyId: true },
    });
    if (!user?.companyId) {
        return next(new ApiError(404, "Empresa no encontrada."));
    }

    const existing = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { logoUrl: true },
    });
    if (!existing?.logoUrl) {
        return next(new ApiError(400, "Tu empresa no tiene un logo configurado."));
    }

    await prisma.company.update({ where: { id: user.companyId }, data: { logoUrl: null } });
    deleteFile(existing.logoUrl);

    const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: SELF_SELECT });
    return res.status(200).json(new ApiResponse(200, company, "Logo eliminado correctamente"));
});
