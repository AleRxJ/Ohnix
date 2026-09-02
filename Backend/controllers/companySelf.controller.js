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
};

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");
const VAT_RESPONSIBILITIES = ["unset", "responsible", "not_responsible"];

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
            electronicInvoicingEnabled: company.electronicInvoicingEnabled,
            electronicInvoicingAtRisk,
            electronicInvoicingProvider: company.electronicInvoicingProvider,
            readiness,
            readinessError,
        }, "Estado de facturación electrónica obtenido correctamente")
    );
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
    await ensureElectronicInvoicingPlan(req.user.prismaId);
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

export const resolveMyFirmaPassOrderNumber = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
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
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const data = await getCompanyFirmaPassValidationDetail({ companyId: company.id, validationUuid: req.params.validationUuid });
    return res.status(200).json(new ApiResponse(200, data, "Validación de FirmaPass obtenida"));
});

export const uploadMyFirmaPassRut = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const data = await uploadCompanyFirmaPassRut({ companyId: company.id, validationUuid: req.params.validationUuid, ...(req.body || {}) });
    return res.status(200).json(new ApiResponse(200, data, "RUT enviado a FirmaPass"));
});

export const uploadMyFirmaPassArchivo = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const data = await uploadCompanyFirmaPassArchivo({ companyId: company.id, validationUuid: req.params.validationUuid, ...(req.body || {}) });
    return res.status(200).json(new ApiResponse(200, data, "Documento enviado a FirmaPass"));
});

export const confirmMyFirmaPassValidation = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
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
    await ensureElectronicInvoicingPlan(req.user.prismaId);
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
