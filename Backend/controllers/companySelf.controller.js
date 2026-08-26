import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";
import { computeNitCheckDigit } from "../utils/nit.util.js";
import {
    addItcycleNumberingResolutionForCompany,
    ensureElectronicInvoicingPlan,
    registerCompanyWithItcycle,
} from "../services/electronicInvoicing.service.js";
import {
    confirmCompanyFirmaPassValidation,
    getCompanyFirmaPassStatus,
    getCompanyDianReadiness,
    setCompanyFirmaPassLoginKey,
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
    vatResponsible: true,
    vatResponsibleEffectiveFrom: true,
};

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");
const VAT_RESPONSIBILITIES = ["unset", "responsible", "not_responsible"];

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

    return res.status(200).json(
        new ApiResponse(200, {
            provisioned: Boolean(company.itcycleCompanyId),
            itcycleCompanyId: company.itcycleCompanyId,
            electronicInvoicingEnabled: company.electronicInvoicingEnabled,
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
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const { dianConfiguration, numberingResolutions, certificate } = req.body || {};
    const data = await registerCompanyWithItcycle({
        companyId: company.id,
        dianConfiguration,
        numberingResolutions,
        certificate,
    });
    return res.status(200).json(new ApiResponse(200, data, "Empresa configurada para facturación electrónica"));
});

export const addMyItcycleNumberingResolution = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const data = await addItcycleNumberingResolutionForCompany({ companyId: company.id, ...(req.body || {}) });
    return res.status(201).json(new ApiResponse(201, data, "Resolución agregada correctamente"));
});

export const setMyFirmaPassLoginKey = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const data = await setCompanyFirmaPassLoginKey({ companyId: company.id, loginKey: req.body?.loginKey });
    return res.status(200).json(new ApiResponse(200, data, "Llave de FirmaPass actualizada"));
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
    const { name, legalName, contactEmail, phone, pdfFooterText, pdfAccentColor, taxIdentification, countryCode, vatResponsible } =
        req.body || {};

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
    if (taxIdentification !== undefined && taxIdentification && !trimmedTaxId) {
        return next(new ApiError(400, "El NIT/tax ID debe contener al menos un dígito."));
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: {
            companyId: true,
            username: true,
            company: (trimmedTaxId && !hasExplicitCountry) || normalizedVatResponsible !== undefined
                ? { select: { countryCode: true, vatResponsible: true } }
                : undefined,
        },
    });

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

    const image = await uploadFile(req.file, {
        ownerId: user?.companyId || req.user.prismaId,
        entity: "branding",
    });
    if (!image) {
        return next(new ApiError(500, "No se pudo subir el logo."));
    }

    let companyId = user?.companyId;
    if (!companyId) {
        const company = await prisma.company.create({
            data: { name: user?.username || "Mi empresa", isActive: true, logoUrl: image.url },
            select: { id: true },
        });
        companyId = company.id;
        await prisma.user.update({ where: { id: req.user.prismaId }, data: { companyId } });
    } else {
        const previous = await prisma.company.findUnique({
            where: { id: companyId },
            select: { logoUrl: true },
        });
        await prisma.company.update({ where: { id: companyId }, data: { logoUrl: image.url } });
        if (previous?.logoUrl) {
            deleteFile(previous.logoUrl);
        }
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: SELF_SELECT });
    return res.status(200).json(new ApiResponse(200, company, "Logo actualizado correctamente"));
});
