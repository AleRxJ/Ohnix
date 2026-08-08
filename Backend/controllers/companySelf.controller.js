import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";

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
};

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");

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
    const { name, legalName, contactEmail, phone, pdfFooterText, pdfAccentColor } = req.body || {};

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

    const user = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { companyId: true, username: true },
    });

    const data = {
        ...(legalName !== undefined ? { legalName: legalName?.trim() || null } : {}),
        ...(contactEmail !== undefined ? { contactEmail: contactEmail?.trim().toLowerCase() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(pdfFooterText !== undefined ? { pdfFooterText: pdfFooterText?.trim() || null } : {}),
        ...(pdfAccentColor !== undefined ? { pdfAccentColor: trimmedAccentColor || null } : {}),
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

    const image = await uploadToCloudinary(req.file);
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
        await prisma.company.update({ where: { id: companyId }, data: { logoUrl: image.url } });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: SELF_SELECT });
    return res.status(200).json(new ApiResponse(200, company, "Logo actualizado correctamente"));
});
