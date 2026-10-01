import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { sendMailSafe } from "../utils/nodemailer.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { buildEmail } from "../utils/emailTemplate.js";
import { logAdminAction } from "../utils/adminAudit.js";
import { sendMetaConversionEvent } from "../services/metaConversionsApi.service.js";
import { detectCatalogMapping, sanitizeCatalogPayload } from "../services/demoCatalog.service.js";
import { planCatalogImport, provisionDemoAccount, readStoredCatalog, sendDemoAccess } from "../services/demoProvisioning.service.js";

export const DEMO_BUSINESS_TYPES = ["retail", "distribution", "food", "manufacturing", "services", "other"];
export const DEMO_PRODUCT_COUNT_RANGES = ["1-50", "51-200", "201-1000", "1000+"];
export const DEMO_SLOTS = ["morning", "afternoon"];
const DEMO_STATUSES = ["new", "contacted", "scheduled", "completed", "converted", "discarded"];
const MAX_DAYS_AHEAD = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const text = (value, max) => `${value ?? ""}`.trim().slice(0, max);
const optionalText = (value, max) => text(value, max) || null;
const pick = (value, allowed) => (allowed.includes(value) ? value : null);

const toDateOnly = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

// Never includes the stored file bytes or rows - those only leave through
// the dedicated file/preview endpoints.
const mapDemoRequest = (request) => ({
        _id: request.id,
        name: request.name,
        email: request.email,
        phone: request.phone,
        company_name: request.companyName,
        business_type: request.businessType,
        product_count_range: request.productCountRange,
        preferred_date: toDateOnly(request.preferredDate),
        preferred_slot: request.preferredSlot,
        message: request.message,
        has_catalog_file: !!request.catalogFileName,
        catalog_file_name: request.catalogFileName,
        catalog_row_count: request.catalogRowCount ?? 0,
        utm_source: request.utmSource,
        utm_medium: request.utmMedium,
        utm_campaign: request.utmCampaign,
        utm_content: request.utmContent,
        status: request.status,
        internal_notes: request.internalNotes,
        provisioned_user_id: request.provisionedUserId,
        provisioned_username: request.provisionedUser?.username || null,
        provisioned_at: request.provisionedAt,
        import_summary: request.importSummary,
        access_sent_at: request.accessSentAt,
        created_at: request.createdAt,
        updated_at: request.updatedAt,
});

// Everything except the heavy columns, for lists and after-update responses.
const SUMMARY_SELECT = {
    id: true,
    name: true,
    email: true,
    phone: true,
    companyName: true,
    businessType: true,
    productCountRange: true,
    preferredDate: true,
    preferredSlot: true,
    message: true,
    catalogFileName: true,
    catalogRowCount: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    utmContent: true,
    status: true,
    internalNotes: true,
    provisionedUserId: true,
    provisionedAt: true,
    importSummary: true,
    accessSentAt: true,
    createdAt: true,
    updatedAt: true,
    provisionedUser: { select: { id: true, username: true } },
};

const findDemoRequestOr404 = async (id, select) => {
    const request = await prisma.demoRequest.findUnique({ where: { id }, ...(select && { select }) });
    if (!request) throw new ApiError(404, "Demo request not found.", [], "", "demo_request_not_found");
    return request;
};

const notifyTeam = async (request) => {
    const adminUrl = `${process.env.FRONTEND_URL || "https://ohnix.co"}/admin/demo-requests?id=${request.id}`;
    const slot = request.preferredSlot === "morning" ? "mañana" : request.preferredSlot === "afternoon" ? "tarde" : null;
    await sendMailSafe(
        {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: process.env.CONTACT_FORM_TO_EMAIL || process.env.SENDER_EMAIL,
            replyTo: request.email,
            subject: `[Interno] Nueva solicitud de demo: ${request.companyName}`,
            ...buildEmail({
                lang: "es",
                category: "Interno · Demos",
                tone: "info",
                badge: "Nueva demo",
                preheader: `${request.name} (${request.companyName}) pidió una demo.`,
                title: "Nueva solicitud de demo",
                intro: "Confírmale el horario por WhatsApp y, si adjuntó su lista de productos, prepárale la cuenta antes de la llamada.",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Nombre", request.name, { bold: true }],
                            ["Empresa", request.companyName, { bold: true }],
                            ["WhatsApp", request.phone],
                            ["Correo", request.email],
                            ["Negocio", request.businessType || "—"],
                            ["Productos", request.productCountRange || "—"],
                            ["Horario preferido", [toDateOnly(request.preferredDate), slot].filter(Boolean).join(" · ") || "—"],
                            ["Lista de productos", request.catalogFileName || "No adjuntó", { color: request.catalogFileName ? "#34d399" : "#8b98a0" }],
                            ["Origen", [request.utmSource, request.utmCampaign].filter(Boolean).join(" / ") || "—"],
                        ],
                    },
                    ...(request.message ? [{ type: "heading", text: "Mensaje" }, { type: "paragraph", html: escapeHtml(request.message).split("\n").join("<br>") }] : []),
                ],
                cta: { label: "Abrir en el panel", url: adminUrl },
                reason: "Alerta interna para el equipo de Ohnix.",
            }),
        },
        "demo-request-team"
    );
};

const confirmToProspect = async (request) => {
    const firstName = request.name.split(" ")[0];
    await sendMailSafe(
        {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: request.email,
            subject: "Recibimos tu solicitud de demo de Ohnix",
            ...buildEmail({
                lang: "es",
                category: "Demo",
                tone: "success",
                badge: "Solicitud recibida",
                preheader: "Te escribiremos por WhatsApp para confirmar el horario.",
                title: `¡Gracias, ${firstName}!`,
                introHtml: `Recibimos tu solicitud de demo para <strong>${escapeHtml(request.companyName)}</strong>. Te escribiremos por WhatsApp al <strong>${escapeHtml(request.phone)}</strong> para confirmar el horario.`,
                blocks: [
                    { type: "heading", text: "Qué sigue" },
                    {
                        type: "list",
                        items: [
                            "Te confirmamos el día y la hora por WhatsApp.",
                            request.catalogFileName
                                ? { html: `Cargamos tu lista de productos (<em>${escapeHtml(request.catalogFileName)}</em>) en una cuenta a tu nombre, para que veas Ohnix con tu propio catálogo.` }
                                : "Si quieres verlo con tus productos, responde este correo con tu lista en Excel y la cargamos antes de la llamada.",
                            "En la demo te mostramos inventario, ventas, caja y facturación DIAN con tu negocio.",
                        ],
                    },
                ],
                secondaryCta: { label: "Conoce Ohnix mientras tanto", url: "https://ohnix.co" },
                reason: "Recibes este correo porque solicitaste una demo en ohnix.co.",
            }),
        },
        "demo-request-confirmation"
    );
};

// POST /demo-requests - public. Multipart: form fields, optional
// `catalog_file` (original spreadsheet) and `catalog_json` (the same file
// already parsed in the browser into { headers, rows }).
export const submitDemoRequest = asyncHandler(async (req, res) => {
    const body = req.body || {};

    // Honeypot: real visitors never see this field. Answer like a success so
    // bots get no signal, but store and send nothing.
    if (text(body.website, 200)) {
        return res.status(201).json(new ApiResponse(201, {}, "Demo request received."));
    }

    const name = text(body.name, 120);
    const email = text(body.email, 160).toLowerCase();
    const phone = text(body.phone, 30);
    const companyName = text(body.company_name, 160);
    if (!name || !email || !phone || !companyName) {
        throw new ApiError(400, "Name, email, WhatsApp and company are required.", [], "", "demo_request_required_fields");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new ApiError(400, "Please provide a valid email address.", [], "", "demo_request_invalid_email");
    }
    if (phone.replace(/\D/g, "").length < 7) {
        throw new ApiError(400, "Please provide a valid WhatsApp number.", [], "", "demo_request_invalid_phone");
    }
    if (`${body.data_consent}` !== "true") {
        throw new ApiError(400, "Data processing consent is required.", [], "", "demo_request_consent_required");
    }

    let preferredDate = null;
    if (body.preferred_date) {
        const parsed = new Date(`${text(body.preferred_date, 10)}T00:00:00Z`);
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        if (Number.isNaN(parsed.getTime()) || parsed < today || parsed - today > MAX_DAYS_AHEAD * DAY_MS) {
            throw new ApiError(400, "Pick a date within the next two months.", [], "", "demo_request_invalid_date");
        }
        preferredDate = parsed;
    }

    const catalog = sanitizeCatalogPayload(body.catalog_json);
    const file = req.file || null;

    const request = await prisma.demoRequest.create({
        data: {
            name,
            email,
            phone,
            companyName,
            businessType: pick(body.business_type, DEMO_BUSINESS_TYPES),
            productCountRange: pick(body.product_count_range, DEMO_PRODUCT_COUNT_RANGES),
            preferredDate,
            preferredSlot: pick(body.preferred_slot, DEMO_SLOTS),
            message: optionalText(body.message, 2000),
            catalogFileName: file ? text(file.originalname, 200) : null,
            catalogFileMime: file ? text(file.mimetype, 120) : null,
            catalogFileData: file ? file.buffer : null,
            catalogHeaders: catalog ? catalog.headers : undefined,
            catalogRows: catalog ? catalog.rows : undefined,
            catalogRowCount: catalog ? catalog.rows.length : 0,
            utmSource: optionalText(body.utm_source, 80),
            utmMedium: optionalText(body.utm_medium, 80),
            utmCampaign: optionalText(body.utm_campaign, 120),
            utmContent: optionalText(body.utm_content, 120),
        },
        select: SUMMARY_SELECT,
    });

    // Emails and the Meta event are best-effort - the request is already
    // saved, which is what the team actually works from.
    Promise.allSettled([notifyTeam(request), confirmToProspect(request)]).catch(() => {});
    sendMetaConversionEvent({
        eventName: "Lead",
        email,
        phone,
        clientIp: req.ip,
        userAgent: req.headers["user-agent"],
        eventSourceUrl: req.headers.referer,
    });

    return res.status(201).json(new ApiResponse(201, { _id: request.id }, "Demo request received."));
});

// ---- Admin -----------------------------------------------------------------

export const listDemoRequests = asyncHandler(async (req, res) => {
    const requests = await prisma.demoRequest.findMany({ select: SUMMARY_SELECT, orderBy: { createdAt: "desc" } });
    return res.status(200).json(new ApiResponse(200, requests.map(mapDemoRequest)));
});

export const getDemoRequest = asyncHandler(async (req, res) => {
    const request = await findDemoRequestOr404(req.params.id, { ...SUMMARY_SELECT, catalogHeaders: true, catalogRows: true });
    const catalog = readStoredCatalog(request);
    return res.status(200).json(
        new ApiResponse(200, {
            ...mapDemoRequest(request),
            catalog: catalog
                ? { headers: catalog.headers, sample_rows: catalog.rows.slice(0, 15), suggested_mapping: detectCatalogMapping(catalog.headers) }
                : null,
        })
    );
});

export const updateDemoRequest = asyncHandler(async (req, res) => {
    await findDemoRequestOr404(req.params.id, { id: true });
    const { status, internal_notes } = req.body || {};
    if (status !== undefined && !DEMO_STATUSES.includes(status)) {
        throw new ApiError(400, "Invalid status.", [], "", "demo_request_invalid_status");
    }
    const updated = await prisma.demoRequest.update({
        where: { id: req.params.id },
        data: {
            ...(status !== undefined && { status }),
            ...(internal_notes !== undefined && { internalNotes: optionalText(internal_notes, 5000) }),
        },
        select: SUMMARY_SELECT,
    });
    return res.status(200).json(new ApiResponse(200, mapDemoRequest(updated)));
});

export const downloadDemoCatalogFile = asyncHandler(async (req, res) => {
    const request = await findDemoRequestOr404(req.params.id, { id: true, catalogFileName: true, catalogFileMime: true, catalogFileData: true });
    if (!request.catalogFileData) throw new ApiError(404, "This request has no file.", [], "", "demo_request_no_file");
    await logAdminAction({ adminId: req.user.prismaId, action: "demo_catalog_downloaded", targetType: "demo_request", targetId: request.id });
    const fileName = (request.catalogFileName || "productos").replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", request.catalogFileMime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(request.catalogFileData));
});

// Dry run of provisionDemoAccount's import for a given column mapping.
export const previewDemoImport = asyncHandler(async (req, res) => {
    const request = await findDemoRequestOr404(req.params.id, { id: true, catalogHeaders: true, catalogRows: true });
    const plan = planCatalogImport(request, req.body?.mapping);
    return res.status(200).json(
        new ApiResponse(200, {
            mapping: plan.mapping,
            total_rows: plan.total,
            importable: plan.products.length,
            categories: [...new Set(plan.products.map((p) => p.category))],
            sample: plan.products.slice(0, 20),
            errors: plan.errors.slice(0, 50),
            warnings: plan.warnings.slice(0, 50),
        })
    );
});

export const provisionDemoRequest = asyncHandler(async (req, res) => {
    const updated = await provisionDemoAccount({ demoRequestId: req.params.id, mapping: req.body?.mapping, adminId: req.user.prismaId });
    return res.status(201).json(new ApiResponse(201, mapDemoRequest(updated), "Demo account created."));
});

export const sendDemoRequestAccess = asyncHandler(async (req, res) => {
    const updated = await sendDemoAccess({ demoRequestId: req.params.id, adminId: req.user.prismaId });
    return res.status(200).json(new ApiResponse(200, mapDemoRequest(updated), "Access sent."));
});
