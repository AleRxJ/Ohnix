import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { notifyWarrantyEvent } from "./warrantyNotification.service.js";
import { NOTIFIABLE_EVENTS } from "../utils/warrantyNotificationDefaults.js";

const ALL_STATUSES = [
    "registered",
    "received",
    "in_review",
    "approved",
    "rejected",
    "in_repair",
    "waiting_part",
    "ready",
    "delivered",
    "closed",
];

// "Closed out" for dashboard/filter purposes - a delivered unit with nothing
// left to do reads the same as a formally closed one for "abiertas vs
// cerradas" (section 1), even though only "closed" is the terminal enum
// value merchants explicitly pick.
const TERMINAL_STATUSES = ["delivered", "closed"];

// Same account+location scope filter used across every other module
// (purchase.controller.js, order.controller.js) - an admin platform role
// bypasses it entirely, everyone else is scoped to their own account and
// (unless posScopeAll) their assigned Points of Sale.
export const buildAccountScopeWhere = (user) =>
    user.role === "admin"
        ? {}
        : {
              createdById: user.prismaId,
              ...(user.posScopeAll ? {} : { pointOfSaleId: { in: user.posScopeIds || [] } }),
          };

const DEFAULT_SETTINGS_DURATION_DAYS = 30;

export const getWarrantySettings = async (accountId) => {
    const existing = await prisma.warrantyModuleSettings.findUnique({ where: { createdById: accountId } });
    if (existing) return existing;
    return {
        id: null,
        createdById: accountId,
        enabledStatuses: ALL_STATUSES,
        defaultWarrantyDurationDays: DEFAULT_SETTINGS_DURATION_DAYS,
    };
};

export const updateWarrantySettings = async (accountId, { enabledStatuses, defaultWarrantyDurationDays }) => {
    const data = {};
    if (Array.isArray(enabledStatuses) && enabledStatuses.length) {
        const invalid = enabledStatuses.filter((s) => !ALL_STATUSES.includes(s));
        if (invalid.length) throw new ApiError(400, `Estado(s) de garantía inválidos: ${invalid.join(", ")}`);
        data.enabledStatuses = enabledStatuses;
    }
    if (defaultWarrantyDurationDays != null) {
        const days = Number(defaultWarrantyDurationDays);
        if (!Number.isFinite(days) || days <= 0) throw new ApiError(400, "La duración por defecto debe ser un número de días positivo.");
        data.defaultWarrantyDurationDays = Math.round(days);
    }

    return prisma.warrantyModuleSettings.upsert({
        where: { createdById: accountId },
        create: {
            createdById: accountId,
            enabledStatuses: data.enabledStatuses || ALL_STATUSES,
            defaultWarrantyDurationDays: data.defaultWarrantyDurationDays || DEFAULT_SETTINGS_DURATION_DAYS,
        },
        update: data,
    });
};

// Search bar behind "Registrar garantía": matches on invoice number, or the
// customer's name/phone/email, so the merchant can find the sale by
// whichever piece of information they have in front of them (spec section 2).
export const lookupSaleForWarranty = async ({ user, query }) => {
    const q = String(query || "").trim();
    if (!q) return [];

    const where = buildAccountScopeWhere(user);
    const orders = await prisma.order.findMany({
        where: {
            ...where,
            OR: [
                { invoiceNo: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
                { customer: { phone: { contains: q } } },
                { customer: { email: { contains: q, mode: "insensitive" } } },
            ],
        },
        include: {
            customer: true,
            orderDetails: { include: { product: true, variant: true } },
        },
        orderBy: { orderDate: "desc" },
        take: 10,
    });

    return orders;
};

const assertCustomerOwnership = async (accountId, customerId) => {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, createdById: accountId } });
    if (!customer) throw new ApiError(404, "Cliente no encontrado.");
    return customer;
};

const assertProductOwnership = async (accountId, productId) => {
    const product = await prisma.product.findFirst({ where: { id: productId, createdById: accountId } });
    if (!product) throw new ApiError(404, "Producto no encontrado.");
    return product;
};

const generateWarrantyNumber = async (tx, accountId) => {
    const year = new Date().getFullYear();
    const counter = await tx.warrantyCounter.upsert({
        where: { createdById_year: { createdById: accountId, year } },
        create: { createdById: accountId, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
    });
    return `GAR-${year}-${String(counter.lastNumber).padStart(6, "0")}`;
};

// Registers a new warranty claim. orderId/orderDetailId are optional (a
// merchant can still register a claim for a sale that predates Ohnix or
// can't be matched - spec section 2's "buscar venta" is a convenience, not
// a hard requirement) but when present are validated to belong to this
// account and to actually reference customerId/productId, so a client can't
// snapshot data it doesn't own by passing an unrelated order's id.
export const createWarranty = async ({ user, actorId, pointOfSaleId, payload: rawPayload }) => {
    // Request bodies across Ohnix's API are snake_case (see purchase.service.js,
    // order.service.js) - normalize once here so the rest of this function
    // (and mapping into Warranty's camelCase Prisma fields) stays readable.
    const payload = {
        customerId: rawPayload.customer_id,
        productId: rawPayload.product_id,
        variantId: rawPayload.variant_id,
        orderId: rawPayload.order_id,
        orderDetailId: rawPayload.order_detail_id,
        quantity: rawPayload.quantity,
        serialNumber: rawPayload.serial_number,
        reason: rawPayload.reason,
        problemDescription: rawPayload.problem_description,
        warrantyDurationDays: rawPayload.warranty_duration_days,
        // Optional override for when warranty coverage starts on a date
        // other than the purchase date (e.g. a made-to-order item whose
        // warranty starts at delivery, weeks later) - defaults to the
        // linked sale's date below when not supplied.
        warrantyStartDate: rawPayload.warranty_start_date,
        observations: rawPayload.observations,
        assignedToId: rawPayload.assigned_to,
    };

    const accountId = user.prismaId;
    const customer = await assertCustomerOwnership(accountId, payload.customerId);
    const product = await assertProductOwnership(accountId, payload.productId);

    let variant = null;
    if (payload.variantId) {
        variant = await prisma.productVariant.findFirst({ where: { id: payload.variantId, productId: product.id } });
        if (!variant) throw new ApiError(404, "Variante de producto no encontrada.");
    }

    let order = null;
    let orderDetail = null;
    if (payload.orderDetailId) {
        orderDetail = await prisma.orderDetail.findFirst({
            where: { id: payload.orderDetailId, productId: product.id },
            include: { order: true },
        });
        if (!orderDetail || orderDetail.order.createdById !== accountId) {
            throw new ApiError(404, "Línea de venta no encontrada.");
        }
        order = orderDetail.order;
    } else if (payload.orderId) {
        order = await prisma.order.findFirst({ where: { id: payload.orderId, createdById: accountId } });
        if (!order) throw new ApiError(404, "Venta no encontrada.");
    }

    const settings = await getWarrantySettings(accountId);
    const warrantyDurationDays = Number(payload.warrantyDurationDays) > 0
        ? Math.round(Number(payload.warrantyDurationDays))
        : settings.defaultWarrantyDurationDays;

    // Coverage counts from the PURCHASE date, not from whenever the merchant
    // gets around to registering the claim - a product bought 25 days ago
    // under a 30-day warranty must show as "5 days left", not reset to a
    // fresh 30 days just because the claim was opened today. Falls back to
    // "now" only when there's no linked sale at all (a fully manual entry
    // with no order/orderDetail), and an explicit override always wins.
    const warrantyStartDate = payload.warrantyStartDate
        ? new Date(payload.warrantyStartDate)
        : order?.orderDate || new Date();
    const dueDate = new Date(warrantyStartDate.getTime() + warrantyDurationDays * 24 * 60 * 60 * 1000);
    // Registering a claim for a sale whose coverage window already lapsed
    // isn't blocked (a merchant may still choose to honor it as a courtesy),
    // but the warranty is created already in the "overdue" state rather than
    // pretending it has a fresh 30/60/365 days left from today - see
    // warranty.controller.js#mapWarranty's `already_expired` flag, which the
    // UI uses to warn the merchant right at creation.

    const reason = String(payload.reason || "").trim();
    const problemDescription = String(payload.problemDescription || "").trim();
    if (!reason) throw new ApiError(400, "El motivo de la garantía es obligatorio.");
    if (!problemDescription) throw new ApiError(400, "La descripción del problema es obligatoria.");

    const warranty = await prisma.$transaction(async (tx) => {
        const warrantyNumber = await generateWarrantyNumber(tx, accountId);
        const created = await tx.warranty.create({
            data: {
                warrantyNumber,
                createdById: accountId,
                pointOfSaleId,
                customerId: customer.id,
                orderId: order?.id || null,
                orderDetailId: orderDetail?.id || null,
                productId: product.id,
                variantId: variant?.id || null,
                quantity: payload.quantity && Number(payload.quantity) > 0 ? Math.round(Number(payload.quantity)) : 1,
                serialNumber: payload.serialNumber || null,
                skuSnapshot: product.sku || null,
                productNameSnapshot: product.productName,
                customerNameSnapshot: customer.name,
                customerPhoneSnapshot: customer.phone || null,
                customerWhatsappSnapshot: customer.whatsapp || null,
                customerEmailSnapshot: customer.email || null,
                invoiceNoSnapshot: order?.invoiceNo || null,
                purchaseDate: order?.orderDate || null,
                warrantyStartDate,
                warrantyDurationDays,
                dueDate,
                reason,
                problemDescription,
                observations: payload.observations || null,
                assignedToId: payload.assignedToId || null,
            },
            include: warrantyIncludeForDetail,
        });

        await tx.warrantyEvent.create({
            data: {
                warrantyId: created.id,
                eventType: "created",
                newStatus: "registered",
                actorId,
            },
        });

        return created;
    });

    if (NOTIFIABLE_EVENTS.includes("registered")) {
        notifyWarrantyEvent(warranty, "registered").catch((error) => {
            console.error("[warranty] auto-notify on create failed", warranty.id, error?.message || error);
        });
    }

    return warranty;
};

export const warrantyIncludeForDetail = {
    customer: true,
    product: true,
    variant: true,
    order: { select: { id: true, invoiceNo: true, orderDate: true, legacyMongoId: true } },
    orderDetail: true,
    pointOfSale: { select: { id: true, name: true } },
    events: { orderBy: { createdAt: "asc" } },
    attachments: { orderBy: { createdAt: "asc" } },
    communications: { orderBy: { createdAt: "desc" } },
};

const findWarrantyScoped = async (user, warrantyId, include = warrantyIncludeForDetail) => {
    const warranty = await prisma.warranty.findFirst({
        where: { id: warrantyId, ...buildAccountScopeWhere(user) },
        include,
    });
    if (!warranty) throw new ApiError(404, "Garantía no encontrada.");
    return warranty;
};

export const getWarrantyDetails = (user, warrantyId) => findWarrantyScoped(user, warrantyId);

const VIEW_FILTERS = {
    overdue: () => ({ dueDate: { lt: new Date() }, status: { notIn: TERMINAL_STATUSES } }),
    due_soon: () => ({
        dueDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        status: { notIn: TERMINAL_STATUSES },
    }),
    open: () => ({ status: { notIn: TERMINAL_STATUSES } }),
    closed: () => ({ status: { in: TERMINAL_STATUSES } }),
};

export const getWarrantyList = async (user, filters = {}) => {
    // Query string keys are snake_case, same convention as everywhere else.
    const {
        status,
        customer_id: customerId,
        product_id: productId,
        invoice_no: invoiceNo,
        date_from: dateFrom,
        date_to: dateTo,
        view,
        search,
        page = 1,
        page_size: pageSize = 20,
    } = filters;

    const where = {
        ...buildAccountScopeWhere(user),
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(productId ? { productId } : {}),
        ...(invoiceNo ? { invoiceNoSnapshot: { contains: invoiceNo, mode: "insensitive" } } : {}),
        ...(dateFrom || dateTo
            ? {
                  createdAt: {
                      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                      ...(dateTo ? { lte: new Date(dateTo) } : {}),
                  },
              }
            : {}),
        ...(view && VIEW_FILTERS[view] ? VIEW_FILTERS[view]() : {}),
        ...(search
            ? {
                  OR: [
                      { warrantyNumber: { contains: search, mode: "insensitive" } },
                      { productNameSnapshot: { contains: search, mode: "insensitive" } },
                      { customerNameSnapshot: { contains: search, mode: "insensitive" } },
                      { invoiceNoSnapshot: { contains: search, mode: "insensitive" } },
                  ],
              }
            : {}),
    };

    const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
        prisma.warranty.findMany({
            where,
            include: { customer: true, product: true, pointOfSale: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
            skip,
            take,
        }),
        prisma.warranty.count({ where }),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
};

export const updateWarrantyStatus = async ({ user, actorId, warrantyId, newStatus, comment }) => {
    const warranty = await findWarrantyScoped(user, warrantyId, warrantyIncludeForDetail);
    if (!ALL_STATUSES.includes(newStatus)) throw new ApiError(400, "Estado de garantía inválido.");

    const settings = await getWarrantySettings(warranty.createdById);
    const enabled = settings.enabledStatuses?.length ? settings.enabledStatuses : ALL_STATUSES;
    if (!enabled.includes(newStatus)) {
        throw new ApiError(400, "Ese estado no está habilitado para esta cuenta. Actívalo en Configuración de garantías.");
    }
    if (newStatus === warranty.status) {
        throw new ApiError(400, "La garantía ya se encuentra en ese estado.");
    }

    const previousStatus = warranty.status;
    const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.warranty.update({
            where: { id: warranty.id },
            data: {
                status: newStatus,
                updatedById: actorId,
                closedAt: newStatus === "closed" ? new Date() : newStatus === "registered" ? null : warranty.closedAt,
            },
            include: warrantyIncludeForDetail,
        });
        await tx.warrantyEvent.create({
            data: {
                warrantyId: warranty.id,
                eventType: "status_changed",
                previousStatus,
                newStatus,
                comment: comment || null,
                actorId,
            },
        });
        return result;
    });

    if (NOTIFIABLE_EVENTS.includes(newStatus)) {
        notifyWarrantyEvent(updated, newStatus).catch((error) => {
            console.error("[warranty] auto-notify on status change failed", updated.id, error?.message || error);
        });
    }

    return updated;
};

// patch is the raw (snake_case) request body - same convention as
// createWarranty above.
const UPDATE_FIELD_MAP = {
    observations: "observations",
    resolution: "resolution",
    assigned_to: "assignedToId",
    reason: "reason",
    problem_description: "problemDescription",
    serial_number: "serialNumber",
};

export const updateWarrantyDetails = async ({ user, actorId, warrantyId, patch }) => {
    const warranty = await findWarrantyScoped(user, warrantyId, { id: true, createdById: true });
    const data = {};
    for (const [bodyKey, field] of Object.entries(UPDATE_FIELD_MAP)) {
        if (Object.prototype.hasOwnProperty.call(patch, bodyKey)) data[field] = patch[bodyKey] || null;
    }
    if (!Object.keys(data).length) throw new ApiError(400, "No hay cambios para guardar.");

    return prisma.$transaction(async (tx) => {
        const updated = await tx.warranty.update({
            where: { id: warranty.id },
            data: { ...data, updatedById: actorId },
            include: warrantyIncludeForDetail,
        });
        await tx.warrantyEvent.create({
            data: {
                warrantyId: warranty.id,
                eventType: "updated",
                actorId,
                payload: { changedFields: Object.keys(data) },
            },
        });
        return updated;
    });
};

export const addWarrantyAttachments = async ({ user, actorId, warrantyId, files }) => {
    const warranty = await findWarrantyScoped(user, warrantyId, { id: true, createdById: true });
    if (!files?.length) throw new ApiError(400, "No se recibieron archivos.");

    const uploaded = [];
    for (const file of files) {
        const result = await uploadFile(file, { ownerId: warranty.createdById, entity: "warranties" });
        if (!result?.url) continue;
        uploaded.push({ url: result.url, fileName: file.originalname, contentType: file.mimetype });
    }
    if (!uploaded.length) throw new ApiError(502, "No fue posible subir los archivos.");

    return prisma.$transaction(async (tx) => {
        await tx.warrantyAttachment.createMany({
            data: uploaded.map((u) => ({ ...u, warrantyId: warranty.id, uploadedById: actorId })),
        });
        await tx.warrantyEvent.create({
            data: { warrantyId: warranty.id, eventType: "attachment_added", actorId, payload: { count: uploaded.length } },
        });
        return tx.warranty.findUnique({ where: { id: warranty.id }, include: warrantyIncludeForDetail });
    });
};

export const removeWarrantyAttachment = async ({ user, warrantyId, attachmentId }) => {
    const warranty = await findWarrantyScoped(user, warrantyId, { id: true });
    const attachment = await prisma.warrantyAttachment.findFirst({ where: { id: attachmentId, warrantyId: warranty.id } });
    if (!attachment) throw new ApiError(404, "Adjunto no encontrado.");

    await deleteFile(attachment.url).catch(() => {});
    await prisma.warrantyAttachment.delete({ where: { id: attachment.id } });
    return { deleted: true };
};

export const deleteWarranty = async ({ user, warrantyId }) => {
    const warranty = await findWarrantyScoped(user, warrantyId, { id: true });
    await prisma.warranty.delete({ where: { id: warranty.id } });
    return { deleted: true };
};

export const getWarrantyDashboardMetrics = async (user) => {
    const where = buildAccountScopeWhere(user);

    const [statusGroups, overdueCount, closedWithDuration, topProducts, topCustomers] = await Promise.all([
        prisma.warranty.groupBy({ by: ["status"], where, _count: { _all: true } }),
        prisma.warranty.count({ where: { ...where, ...VIEW_FILTERS.overdue() } }),
        prisma.warranty.findMany({
            where: { ...where, status: "closed", closedAt: { not: null } },
            select: { createdAt: true, closedAt: true },
        }),
        prisma.warranty.groupBy({ by: ["productId"], where, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 5 }),
        prisma.warranty.groupBy({ by: ["customerId"], where, _count: { _all: true }, orderBy: { _count: { customerId: "desc" } }, take: 5 }),
    ]);

    const avgResolutionMs = closedWithDuration.length
        ? closedWithDuration.reduce((sum, w) => sum + (w.closedAt.getTime() - w.createdAt.getTime()), 0) / closedWithDuration.length
        : null;

    const [products, customers] = await Promise.all([
        prisma.product.findMany({ where: { id: { in: topProducts.map((p) => p.productId) } }, select: { id: true, productName: true } }),
        prisma.customer.findMany({ where: { id: { in: topCustomers.map((c) => c.customerId) } }, select: { id: true, name: true } }),
    ]);
    const productById = Object.fromEntries(products.map((p) => [p.id, p]));
    const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));

    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const approved = statusGroups.find((g) => g.status === "approved")?._count._all || 0;
    const rejected = statusGroups.find((g) => g.status === "rejected")?._count._all || 0;
    const decided = approved + rejected;

    return {
        byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
        total,
        overdue: overdueCount,
        avgResolutionDays: avgResolutionMs != null ? Number((avgResolutionMs / (24 * 60 * 60 * 1000)).toFixed(1)) : null,
        approvalRate: decided ? Number(((approved / decided) * 100).toFixed(1)) : null,
        topProducts: topProducts.map((p) => ({ productId: p.productId, name: productById[p.productId]?.productName || "—", count: p._count._all })),
        topCustomers: topCustomers.map((c) => ({ customerId: c.customerId, name: customerById[c.customerId]?.name || "—", count: c._count._all })),
    };
};

export { ALL_STATUSES, TERMINAL_STATUSES };
