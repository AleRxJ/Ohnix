import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import * as warrantyService from "../services/warranty.service.js";
import { notifyWarrantyEvent } from "../services/warrantyNotification.service.js";
import { prisma } from "../db/prisma.js";
import { renderTemplate } from "../utils/warrantyTemplateRenderer.js";
import { DEFAULT_EMAIL_TEMPLATES, DEFAULT_WHATSAPP_TEMPLATES, GENERIC_UPDATE_TEMPLATE } from "../utils/warrantyNotificationDefaults.js";

const toExternalId = (entity) => entity?.legacyMongoId || entity?.id;

const mapProduct = (product) =>
    product && {
        _id: toExternalId(product),
        product_name: product.productName,
        sku: product.sku,
        brand: product.brand,
    };

const mapCustomer = (customer) =>
    customer && {
        _id: toExternalId(customer),
        name: customer.name,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        address: customer.address,
    };

const mapEvent = (event) => ({
    _id: event.id,
    event_type: event.eventType,
    previous_status: event.previousStatus,
    new_status: event.newStatus,
    comment: event.comment,
    actor_id: event.actorId,
    payload: event.payload,
    created_at: event.createdAt,
});

const mapAttachment = (attachment) => ({
    _id: attachment.id,
    url: attachment.url,
    file_name: attachment.fileName,
    content_type: attachment.contentType,
    uploaded_by: attachment.uploadedById,
    created_at: attachment.createdAt,
});

const mapCommunication = (communication) => ({
    _id: communication.id,
    channel: communication.channel,
    event_trigger: communication.eventTrigger,
    recipient: communication.recipient,
    subject: communication.subject,
    body: communication.body,
    status: communication.status,
    error_message: communication.errorMessage,
    attempts: communication.attempts,
    triggered_by: communication.triggeredById,
    created_at: communication.createdAt,
});

const mapWarranty = (warranty) => ({
    _id: toExternalId(warranty),
    warranty_number: warranty.warrantyNumber,
    status: warranty.status,
    customer: mapCustomer(warranty.customer),
    product: mapProduct(warranty.product),
    variant_id: warranty.variantId,
    order_id: warranty.order ? toExternalId(warranty.order) : null,
    invoice_no: warranty.invoiceNoSnapshot,
    purchase_date: warranty.purchaseDate,
    quantity: warranty.quantity,
    serial_number: warranty.serialNumber,
    sku_snapshot: warranty.skuSnapshot,
    product_name_snapshot: warranty.productNameSnapshot,
    customer_name_snapshot: warranty.customerNameSnapshot,
    warranty_start_date: warranty.warrantyStartDate,
    warranty_duration_days: warranty.warrantyDurationDays,
    due_date: warranty.dueDate,
    // Coverage is counted from the purchase date (see
    // warranty.service.js#createWarranty), so a claim registered long after
    // the sale can legitimately be born already outside its window - this
    // lets the UI warn the merchant right at creation instead of them only
    // noticing later in the "vencidas" filter.
    already_expired: new Date(warranty.dueDate).getTime() < Date.now(),
    reason: warranty.reason,
    problem_description: warranty.problemDescription,
    observations: warranty.observations,
    resolution: warranty.resolution,
    assigned_to: warranty.assignedToId,
    closed_at: warranty.closedAt,
    point_of_sale: warranty.pointOfSale ? { _id: warranty.pointOfSale.id, name: warranty.pointOfSale.name } : null,
    events: (warranty.events || []).map(mapEvent),
    attachments: (warranty.attachments || []).map(mapAttachment),
    communications: (warranty.communications || []).map(mapCommunication),
    created_at: warranty.createdAt,
    updated_at: warranty.updatedAt,
});

const mapWarrantyListItem = (warranty) => ({
    _id: toExternalId(warranty),
    warranty_number: warranty.warrantyNumber,
    status: warranty.status,
    customer: mapCustomer(warranty.customer),
    product: mapProduct(warranty.product),
    invoice_no: warranty.invoiceNoSnapshot,
    due_date: warranty.dueDate,
    point_of_sale: warranty.pointOfSale ? { _id: warranty.pointOfSale.id, name: warranty.pointOfSale.name } : null,
    created_at: warranty.createdAt,
});

const mapOrderLookupResult = (order) => ({
    order_id: toExternalId(order),
    invoice_no: order.invoiceNo,
    order_date: order.orderDate,
    customer: mapCustomer(order.customer),
    lines: (order.orderDetails || []).map((detail) => ({
        order_detail_id: detail.id,
        quantity: detail.quantity,
        product: mapProduct(detail.product),
        variant_id: detail.variantId,
    })),
});

export const lookupSaleForWarranty = asyncHandler(async (req, res) => {
    const orders = await warrantyService.lookupSaleForWarranty({ user: req.user, query: req.query.query });
    return res.status(200).json(new ApiResponse(200, orders.map(mapOrderLookupResult), "Search completed"));
});

export const createWarranty = asyncHandler(async (req, res) => {
    // A claim registered from a sale belongs where that sale happened - the
    // drawer doesn't ask for a location, so without this a multi-location
    // account couldn't register a warranty at all.
    const saleOrder = req.body?.order_detail_id
        ? (await prisma.orderDetail.findFirst({ where: { id: req.body.order_detail_id }, select: { order: { select: { pointOfSaleId: true, createdById: true } } } }))?.order
        : req.body?.order_id
          ? await prisma.order.findFirst({ where: { id: req.body.order_id }, select: { pointOfSaleId: true, createdById: true } })
          : null;
    const fallbackId = saleOrder?.createdById === req.user.prismaId ? saleOrder.pointOfSaleId : null;
    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req, { fallbackId });
    const warranty = await warrantyService.createWarranty({
        user: req.user,
        actorId: req.user.prismaId,
        pointOfSaleId,
        payload: req.body,
    });
    return res.status(201).json(new ApiResponse(201, mapWarranty(warranty), "Warranty registered successfully"));
});

export const getAllWarranties = asyncHandler(async (req, res) => {
    const result = await warrantyService.getWarrantyList(req.user, req.query);
    return res.status(200).json(
        new ApiResponse(
            200,
            { items: result.items.map(mapWarrantyListItem), total: result.total, page: result.page, page_size: result.pageSize },
            "Warranties fetched successfully"
        )
    );
});

export const getWarrantyDashboard = asyncHandler(async (req, res) => {
    const metrics = await warrantyService.getWarrantyDashboardMetrics(req.user);
    return res.status(200).json(new ApiResponse(200, metrics, "Warranty dashboard metrics fetched successfully"));
});

export const getWarrantyDetails = asyncHandler(async (req, res) => {
    const warranty = await warrantyService.getWarrantyDetails(req.user, req.params.id);
    return res.status(200).json(new ApiResponse(200, mapWarranty(warranty), "Warranty fetched successfully"));
});

export const updateWarranty = asyncHandler(async (req, res) => {
    const warranty = await warrantyService.updateWarrantyDetails({
        user: req.user,
        actorId: req.user.prismaId,
        warrantyId: req.params.id,
        patch: req.body,
    });
    return res.status(200).json(new ApiResponse(200, mapWarranty(warranty), "Warranty updated successfully"));
});

export const updateWarrantyStatus = asyncHandler(async (req, res) => {
    const { status, comment } = req.body;
    if (!status) throw new ApiError(400, "status es obligatorio.");
    const warranty = await warrantyService.updateWarrantyStatus({
        user: req.user,
        actorId: req.user.prismaId,
        warrantyId: req.params.id,
        newStatus: status,
        comment,
    });
    return res.status(200).json(new ApiResponse(200, mapWarranty(warranty), `Warranty status updated to ${status}`));
});

export const deleteWarranty = asyncHandler(async (req, res) => {
    await warrantyService.deleteWarranty({ user: req.user, warrantyId: req.params.id });
    return res.status(200).json(new ApiResponse(200, { deleted: true }, "Warranty deleted successfully"));
});

export const addWarrantyAttachments = asyncHandler(async (req, res) => {
    const warranty = await warrantyService.addWarrantyAttachments({
        user: req.user,
        actorId: req.user.prismaId,
        warrantyId: req.params.id,
        files: req.files,
    });
    return res.status(201).json(new ApiResponse(201, mapWarranty(warranty), "Attachments added successfully"));
});

export const removeWarrantyAttachment = asyncHandler(async (req, res) => {
    await warrantyService.removeWarrantyAttachment({
        user: req.user,
        warrantyId: req.params.id,
        attachmentId: req.params.attachmentId,
    });
    return res.status(200).json(new ApiResponse(200, { deleted: true }, "Attachment removed successfully"));
});

const CHANNEL_ALIASES = { both: ["whatsapp", "email"], whatsapp: ["whatsapp"], email: ["email"] };

export const previewWarrantyNotification = asyncHandler(async (req, res) => {
    const warranty = await warrantyService.getWarrantyDetails(req.user, req.params.id);
    const eventKey = req.query.event || warranty.status;
    const channel = req.query.channel === "whatsapp" ? "whatsapp" : "email";

    // Dry-run preview - resolves the same template a real send would use but
    // never sends anything, so "vista previa" (spec section 9) never has a
    // delivery side effect.
    const row = await prisma.warrantyNotificationTemplate.findUnique({
        where: { createdById_event_channel: { createdById: warranty.createdById, event: eventKey, channel } },
    });
    // Same GENERIC_UPDATE_TEMPLATE fallback as a real manual send (see
    // warrantyNotification.service.js#resolveTemplate) - a status with no
    // dedicated default (e.g. "in_review") still previews something coherent.
    const defaultBody = channel === "email" ? DEFAULT_EMAIL_TEMPLATES[eventKey]?.body : DEFAULT_WHATSAPP_TEMPLATES[eventKey];
    const defaultSubject = channel === "email" ? DEFAULT_EMAIL_TEMPLATES[eventKey]?.subject : null;
    const subject = row?.subject ?? defaultSubject ?? GENERIC_UPDATE_TEMPLATE.subject;
    const bodyTemplate = row?.bodyTemplate ?? defaultBody ?? GENERIC_UPDATE_TEMPLATE.body;

    const company = await prisma.user.findUnique({
        where: { id: warranty.createdById },
        select: { username: true, company: { select: { name: true, legalName: true, phone: true } } },
    });
    const business = {
        name: company?.company?.name || company?.company?.legalName || company?.username || "Ohnix",
        phone: company?.company?.phone || "",
        address: "",
    };
    const variables = {
        cliente_nombre: warranty.customerNameSnapshot,
        empresa_nombre: business.name,
        producto_nombre: warranty.productNameSnapshot,
        garantia_id: warranty.warrantyNumber,
        fecha_compra: warranty.purchaseDate ? new Date(warranty.purchaseDate).toLocaleDateString("es-CO") : "",
        fecha_vencimiento: new Date(warranty.dueDate).toLocaleDateString("es-CO"),
        numero_factura: warranty.invoiceNoSnapshot || "",
        estado_garantia: warranty.status,
        empresa_telefono: business.phone,
        empresa_direccion: business.address,
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            { channel, subject: subject ? renderTemplate(subject, variables) : null, body: renderTemplate(bodyTemplate, variables) },
            "Preview generated"
        )
    );
});

export const sendManualWarrantyNotification = asyncHandler(async (req, res) => {
    const warranty = await warrantyService.getWarrantyDetails(req.user, req.params.id);
    const channels = CHANNEL_ALIASES[req.body.channel] || CHANNEL_ALIASES.both;
    const eventKey = req.body.event || warranty.status;

    const result = await notifyWarrantyEvent(warranty, eventKey, { manual: true, actorId: req.user.prismaId, channels });
    return res.status(200).json(new ApiResponse(200, result, "Notification dispatched"));
});

export const getWarrantySettings = asyncHandler(async (req, res) => {
    const settings = await warrantyService.getWarrantySettings(req.user.prismaId);
    const templates = await prisma.warrantyNotificationTemplate.findMany({ where: { createdById: req.user.prismaId } });
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                enabled_statuses: settings.enabledStatuses,
                default_warranty_duration_days: settings.defaultWarrantyDurationDays,
                templates: templates.map((t) => ({
                    event: t.event,
                    channel: t.channel,
                    is_enabled: t.isEnabled,
                    subject: t.subject,
                    body_template: t.bodyTemplate,
                    meta_template_name: t.metaTemplateName,
                    meta_template_language: t.metaTemplateLanguage,
                })),
            },
            "Warranty settings fetched successfully"
        )
    );
});

export const updateWarrantySettings = asyncHandler(async (req, res) => {
    const accountId = req.user.prismaId;
    const { enabled_statuses, default_warranty_duration_days, templates } = req.body;

    const settings = await warrantyService.updateWarrantySettings(accountId, {
        enabledStatuses: enabled_statuses,
        defaultWarrantyDurationDays: default_warranty_duration_days,
    });

    if (Array.isArray(templates)) {
        for (const template of templates) {
            if (!template?.event || !template?.channel) continue;
            await prisma.warrantyNotificationTemplate.upsert({
                where: { createdById_event_channel: { createdById: accountId, event: template.event, channel: template.channel } },
                create: {
                    createdById: accountId,
                    event: template.event,
                    channel: template.channel,
                    isEnabled: template.is_enabled !== false,
                    subject: template.subject || null,
                    bodyTemplate: template.body_template || "",
                    metaTemplateName: template.meta_template_name || null,
                    metaTemplateLanguage: template.meta_template_language || "es",
                },
                update: {
                    isEnabled: template.is_enabled !== false,
                    subject: template.subject || null,
                    ...(template.body_template ? { bodyTemplate: template.body_template } : {}),
                    metaTemplateName: template.meta_template_name || null,
                    metaTemplateLanguage: template.meta_template_language || "es",
                },
            });
        }
    }

    return res.status(200).json(new ApiResponse(200, { enabled_statuses: settings.enabledStatuses }, "Warranty settings updated successfully"));
});
