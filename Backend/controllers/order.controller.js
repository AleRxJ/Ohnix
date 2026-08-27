import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import orderService from "../services/order.service.js";
import PDFDocument from "pdfkit";
import { prisma } from "../db/prisma.js";
import { ensureUserSubscription, getEffectivePlan } from "../middleware/pricing.middleware.js";
import { resolveOrAssertPointOfSaleId, hasPosAccess } from "../middleware/pos.permissions.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapOrder = (order) => ({
    _id: toExternalId(order),
    customer_id: order.customer
        ? {
              _id: toExternalId(order.customer),
              name: order.customer.name,
          }
        : null,
    order_date: order.orderDate,
    order_status: order.orderStatus,
    total_products: order.totalProducts,
    sub_total: Number(order.subTotal),
    gst: Number(order.gst),
    total: Number(order.total),
    invoice_no: order.invoiceNo,
    created_by: order.createdBy
        ? {
              _id: toExternalId(order.createdBy),
              username: order.createdBy.username,
          }
        : null,
    updated_by: order.updatedBy
        ? {
              _id: toExternalId(order.updatedBy),
              username: order.updatedBy.username,
          }
        : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
});

const mapOrderDetail = (detail) => ({
    _id: toExternalId(detail),
    order_id: detail.order ? toExternalId(detail.order) : detail.orderId,
    product_id: detail.product
        ? {
              _id: toExternalId(detail.product),
              product_name: detail.product.productName,
              product_code: detail.product.productCode,
          }
        : null,
    quantity: detail.quantity,
    unitcost: Number(detail.unitcost),
    total: Number(detail.total),
    return_date: detail.returnDate,
    returned_quantity: detail.returnedQuantity,
    pending_quantity: detail.quantity - detail.returnedQuantity,
    refund_amount: Number(detail.refundAmount),
    fully_returned: detail.returnedQuantity === detail.quantity,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
});

const findOrderByAnyId = async (id) =>
    prisma.order.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            customer: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    name: true,
                    phone: true,
                    address: true,
                },
            },
            createdBy: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    username: true,
                    company: {
                        select: {
                            name: true,
                            legalName: true,
                            contactEmail: true,
                            phone: true,
                            logoUrl: true,
                            pdfFooterText: true,
                            pdfAccentColor: true,
                        },
                    },
                },
            },
            updatedBy: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    username: true,
                },
            },
            electronicInvoice: {
                select: { status: true },
            },
        },
    });

const createOrder = asyncHandler(async (req, res, next) => {
    try {
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
        const order = await orderService.createOrder(
            req.body,
            req.user.prismaId,
            req.user.role,
            pointOfSaleId
        );
        return res
            .status(201)
            .json(new ApiResponse(201, order, "Order created successfully"));
    } catch (err) {
        return next(err);
    }
});

const getAllOrders = asyncHandler(async (req, res, next) => {
    const {
        search,
        customer_id,
        start_date,
        end_date,
        order_status,
        min_total,
        max_total,
        sort_by,
        sort_order,
        page = 1,
        limit = 10,
    } = req.query;

    const where = {};

    if (req.user.role !== "admin") {
        where.createdById = req.user.prismaId;
        // Restricted-scope actors (see pos.permissions.js) only ever see
        // orders from their own locations - full-scope (owner, or a member
        // with posScopeAll) needs no extra filter here since it already
        // means "every location this account has, including future ones".
        if (!req.user.posScopeAll) {
            where.pointOfSaleId = { in: req.user.posScopeIds || [] };
        }
    }

    if (search) {
        where.OR = [{ invoiceNo: { contains: search, mode: "insensitive" } }];
    }

    if (customer_id) {
        where.customer = {
            OR: [{ id: customer_id }, { legacyMongoId: customer_id }],
        };
    }

    if (order_status) where.orderStatus = order_status;

    if (start_date || end_date) {
        where.orderDate = {};
        if (start_date) where.orderDate.gte = new Date(start_date);
        if (end_date) where.orderDate.lte = new Date(end_date);
    }

    const minTotalNum = min_total !== undefined ? Number(min_total) : undefined;
    const maxTotalNum = max_total !== undefined ? Number(max_total) : undefined;

    if (!Number.isNaN(minTotalNum) || !Number.isNaN(maxTotalNum)) {
        where.total = {};
        if (!Number.isNaN(minTotalNum)) where.total.gte = minTotalNum;
        if (!Number.isNaN(maxTotalNum)) where.total.lte = maxTotalNum;
    }

    const sortFieldMap = {
        invoice_no: "invoiceNo",
        order_date: "orderDate",
        order_status: "orderStatus",
        total_products: "totalProducts",
        sub_total: "subTotal",
        gst: "gst",
        total: "total",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
    };

    const mappedSortField = sortFieldMap[sort_by] || "createdAt";
    const sortDirection = sort_order === "desc" ? "desc" : "asc";
    const orderBy = sort_by
        ? { [mappedSortField]: sortDirection }
        : { createdAt: "desc" };

    const pageNum = Number.parseInt(page, 10) || 1;
    const limitNum = Math.min(Number.parseInt(limit, 10) || 10, 100);
    const skip = (pageNum - 1) * limitNum;

    try {
        const [orders, total, statusCounts, revenueAgg] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    customer: {
                        select: {
                            id: true,
                            legacyMongoId: true,
                            name: true,
                        },
                    },
                    createdBy: {
                        select: {
                            id: true,
                            legacyMongoId: true,
                            username: true,
                        },
                    },
                    updatedBy: {
                        select: {
                            id: true,
                            legacyMongoId: true,
                            username: true,
                        },
                    },
                },
                orderBy,
                skip,
                take: limitNum,
            }),
            prisma.order.count({ where }),
            // Same `where` as the paginated query above but without
            // skip/take - stats.pending/completed/revenue must reflect every
            // matching order, not just the current page (the frontend used
            // to derive them from the page slice it got back, so "Total
            // Revenue" silently under-reported for any account with more
            // than one page of orders).
            prisma.order.groupBy({
                by: ["orderStatus"],
                where,
                _count: { _all: true },
            }),
            prisma.order.aggregate({
                where: { ...where, orderStatus: { not: "cancelled" } },
                _sum: { total: true },
            }),
        ]);

        const countByStatus = (targetStatus) =>
            statusCounts.find((row) => row.orderStatus === targetStatus)?._count._all || 0;

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    orders: orders.map(mapOrder),
                    pagination: {
                        total,
                        page: pageNum,
                        limit: limitNum,
                        pages: Math.ceil(total / limitNum),
                    },
                    stats: {
                        total,
                        pending: countByStatus("pending"),
                        completed: countByStatus("completed"),
                        returned: countByStatus("returned"),
                        revenue: Number(revenueAgg._sum.total || 0),
                    },
                },
                "Orders fetched successfully"
            )
        );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getAllOrdersAdmin = getAllOrders;

const getOrderDetails = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const order = await findOrderByAnyId(id);

        if (!order) {
            return next(new ApiError(404, "Order not found"));
        }

        if (req.user.role !== "admin" && order.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You are not authorized to access this order")
            );
        }
        if (req.user.role !== "admin" && !hasPosAccess(req.user, order.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        const details = await prisma.orderDetail.findMany({
            where: { orderId: order.id },
            include: {
                order: {
                    select: { id: true, legacyMongoId: true },
                },
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        productCode: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    details.map(mapOrderDetail),
                    "Order details fetched successfully"
                )
            );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updateOrderStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { order_status } = req.body;

    if (!order_status) {
        return next(new ApiError(400, "Order status is required"));
    }

    try {
        const order = await orderService.updateOrderStatus(
            id,
            order_status,
            req.user.prismaId,
            req.user.role,
            req.user
        );

        return res
            .status(200)
            .json(
                new ApiResponse(200, order, "Order status updated successfully")
            );
    } catch (err) {
        return next(err);
    }
});

const getOrderReturnPreview = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const order = await findOrderByAnyId(id);

        if (!order) {
            return next(new ApiError(404, "Order not found"));
        }

        if (req.user.role !== "admin" && order.createdById !== req.user.prismaId) {
            return next(
                new ApiError(403, "You don't have permission to view this order")
            );
        }
        if (req.user.role !== "admin" && !hasPosAccess(req.user, order.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        if (order.orderStatus === "returned") {
            return next(new ApiError(400, "Order is already fully returned"));
        }

        if (order.orderStatus !== "completed") {
            return next(new ApiError(400, "Only completed orders can be returned"));
        }

        const orderDetails = await prisma.orderDetail.findMany({
            where: { orderId: order.id },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        stock: true,
                    },
                },
            },
        });

        // Unlike a purchase return (bounded by current stock), a sales
        // return always increases stock - the only ceiling is what's still
        // outstanding on the line.
        let totalPotentialRefund = 0;

        const returnPreview = orderDetails.map((detail) => {
            const product = detail.product;
            const pendingQuantity = Math.max(detail.quantity - detail.returnedQuantity, 0);
            const refundAmount = pendingQuantity * Number(detail.unitcost);
            totalPotentialRefund += refundAmount;

            return {
                order_detail_id: toExternalId(detail),
                product_id: toExternalId(product),
                product_name: product.productName,
                sold_quantity: detail.quantity,
                already_returned_quantity: detail.returnedQuantity,
                pending_quantity: pendingQuantity,
                current_stock: product.stock,
                returnable_quantity: pendingQuantity,
                unit_cost: Number(detail.unitcost),
                potential_refund: refundAmount,
                can_fully_return: true,
            };
        });

        const requiresCreditNote = ["submitted", "accepted"].includes(
            order.electronicInvoice?.status
        );

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    order_id: toExternalId(order),
                    invoice_no: order.invoiceNo,
                    requires_credit_note: requiresCreditNote,
                    total_potential_refund: totalPotentialRefund,
                    return_preview: returnPreview,
                },
                "Return preview generated successfully"
            )
        );
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const processOrderReturn = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { lines } = req.body;

    if (!Array.isArray(lines) || lines.length === 0) {
        return next(new ApiError(400, "At least one return line is required"));
    }

    try {
        const result = await orderService.processReturn(
            id,
            lines,
            req.user.prismaId,
            req.user.role,
            req.user
        );

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    result,
                    result.order_fully_returned
                        ? "Order fully returned"
                        : "Return processed successfully"
                )
            );
    } catch (err) {
        return next(err);
    }
});

// Carrier-agnostic package/weight breakdown for this order - see
// order.service.js#buildShippingPayload. Nothing consumes this yet (no
// carrier is integrated), but the endpoint is exposed now so the
// aggregation logic is exercised end-to-end before a real integration
// creates any urgency around it.
const getOrderShippingPayload = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const payload = await orderService.buildShippingPayload(id, req.user.prismaId, req.user.role, req.user);
        return res
            .status(200)
            .json(new ApiResponse(200, payload, "Shipping payload generated successfully"));
    } catch (err) {
        return next(err);
    }
});

const generateInvoice = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const order = await findOrderByAnyId(id);

        if (!order) {
            return next(
                new ApiError(
                    404,
                    "Order not found or you don't have permission to access it"
                )
            );
        }

        if (
            (req.user.role !== "admin" && order.createdById !== req.user.prismaId) ||
            (req.user.role !== "admin" && !hasPosAccess(req.user, order.pointOfSaleId))
        ) {
            return next(
                new ApiError(
                    404,
                    "Order not found or you don't have permission to access it"
                )
            );
        }

        const details = await prisma.orderDetail.findMany({
            where: { orderId: order.id },
            include: {
                product: {
                    select: {
                        id: true,
                        productName: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        });

        const orderDetails = {
            invoice_no: order.invoiceNo,
            order_date: order.orderDate,
            order_status: order.orderStatus,
            total_products: order.totalProducts,
            sub_total: Number(order.subTotal),
            gst: Number(order.gst),
            total: Number(order.total),
            customer_name: order.customer?.name || "N/A",
            customer_phone: order.customer?.phone || "N/A",
            customer_address: order.customer?.address || "N/A",
            created_by: order.createdBy?.username || "N/A",
            orderItems: details.map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
                unitcost: Number(item.unitcost),
                total: Number(item.total),
                product_name: item.product?.productName || "N/A",
            })),
        };

        // Order PDF branding is plan-gated: Emprendedor keeps the generic
        // template ("PDF de pedidos estándar"), Negocio+ gets the company's
        // name/legal data/logo, Escala+ additionally gets a custom footer.
        const subscription = await ensureUserSubscription(order.createdById);
        const effectivePlan = getEffectivePlan(subscription);
        const company = effectivePlan !== "starter" ? order.createdBy?.company : null;
        const showCustomFooter = ["scale", "enterprise"].includes(effectivePlan);
        // Escala+ "fully customizable" PDF: brand color replaces the fixed
        // accent/highlight blues below when set and valid; anyone without
        // one configured (or below Escala) keeps the current default look.
        const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");
        const brandAccentColor =
            showCustomFooter && isValidHexColor(company?.pdfAccentColor)
                ? company.pdfAccentColor
                : null;

        let logoBuffer = null;
        if (company?.logoUrl) {
            try {
                const logoResponse = await fetch(company.logoUrl);
                if (logoResponse.ok) {
                    logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
                }
            } catch {
                // Falls back to text-only header below.
            }
        }

        const doc = new PDFDocument({
            margin: 50,
            size: "A4",
            bufferPages: true,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=invoice-${orderDetails.invoice_no}.pdf`
        );

        doc.pipe(res);

        // Ohnix brand palette, adapted for a printed document. The hero
        // band below is where the actual app teal (#29D8D5/#44F3F0) gets to
        // be itself - bright, on a dark ground, exactly like the gradient
        // buttons/CTAs in the app. On the white body further down, the same
        // hue would wash out as body text, so inkTeal (a deeper shade)
        // carries text/numbers there instead.
        const inkColor = "#0B0F19";
        const heroColor = "#0B0F19";
        const heroColorDeep = "#0E2624";
        const mutedColor = "#6B7280";
        const mutedOnDark = "#9AA5B1";
        const lineColor = "#EAECF0";
        const tealBright = "#29D8D5";
        const tealLight = "#44F3F0";
        const inkTeal = brandAccentColor || "#0B7A78";
        const PAGE_LEFT = 50;
        const PAGE_RIGHT = 545;
        const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

        const hairline = (y, color = lineColor, weight = 1) => {
            doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).strokeColor(color).lineWidth(weight).stroke();
        };

        // Small translated status pill - reuses the same semantic colors as
        // the in-app status tags (orderHelpers.js's getStatusColor) instead
        // of a plain text label, so the document reads at a glance.
        const STATUS_META = {
            pending: { label: "PENDIENTE", bg: "#FEF3E2", fg: "#B45309" },
            processing: { label: "EN PROGRESO", bg: "#EFF6FF", fg: "#1D4ED8" },
            completed: { label: "COMPLETADO", bg: "#ECFDF5", fg: "#047857" },
            cancelled: { label: "CANCELADO", bg: "#FEF2F2", fg: "#B91C1C" },
        };
        const status = STATUS_META[orderDetails.order_status] || STATUS_META.pending;

        // --- Hero band ---------------------------------------------------
        // A full-bleed dark panel instead of a plain white masthead is the
        // one move that reads as "designed" from across the room - it's the
        // same trick most modern billing products (Stripe, Ramp, Mercury)
        // lean on for their invoice header, and it's the natural home for
        // the app's actual bright teal, which needs a dark ground to pop.
        const HERO_HEIGHT = 158;
        const heroGrad = doc.linearGradient(0, 0, 595, HERO_HEIGHT);
        heroGrad.stop(0, heroColor).stop(1, heroColorDeep);
        doc.rect(0, 0, 595, HERO_HEIGHT).fill(heroGrad);

        // Faint rotated square behind the invoice number - a quiet echo of
        // the rounded-square logomark, purely textural, low opacity so it
        // never competes with the text sitting on top of it.
        doc.save();
        doc.rotate(18, { origin: [480, 70] });
        doc.roundedRect(415, 5, 130, 130, 26)
            .strokeColor(tealLight)
            .strokeOpacity(0.12)
            .lineWidth(2)
            .stroke();
        doc.restore();
        doc.strokeOpacity(1);

        if (company) {
            const hasLogo = Boolean(logoBuffer);
            const textX = hasLogo ? 148 : PAGE_LEFT;
            if (hasLogo) {
                // White backing chip so an arbitrary uploaded logo (most of
                // which assume a light background) still reads correctly
                // sitting on the dark band.
                doc.roundedRect(PAGE_LEFT, 34, 84, 56, 8).fill("#FFFFFF");
                try {
                    doc.image(logoBuffer, PAGE_LEFT + 7, 41, { fit: [70, 42] });
                } catch {
                    // Corrupt/unsupported image format - continue without it.
                }
            }
            doc.fontSize(18)
                .fillColor("#FFFFFF")
                .font("Helvetica-Bold")
                .text(company.name, textX, 46, { width: 265 - (textX - PAGE_LEFT) });

            const legalLine = [company.legalName, company.contactEmail, company.phone]
                .filter(Boolean)
                .join("  ·  ");
            if (legalLine) {
                doc.fontSize(8)
                    .fillColor(mutedOnDark)
                    .font("Helvetica")
                    .text(legalLine, textX, 68, { width: 265 - (textX - PAGE_LEFT) });
            }
        } else {
            // Default (no per-company branding on this plan) - a small
            // rounded logomark plus a tight wordmark, like a real logo
            // lockup, instead of a generic app name in spaced-out caps.
            doc.roundedRect(PAGE_LEFT, 46, 26, 26, 7).fill(tealBright);
            doc.fontSize(19)
                .fillColor("#FFFFFF")
                .font("Helvetica-Bold")
                .text("OHNIX", PAGE_LEFT + 34, 51, { characterSpacing: 0.5 });
            doc.fontSize(8)
                .fillColor(mutedOnDark)
                .font("Helvetica")
                .text("Software de inventario y ventas", PAGE_LEFT + 34, 70);
        }

        // Right-aligned document identity block, on the dark band.
        doc.fontSize(9)
            .fillColor(tealBright)
            .font("Helvetica-Bold")
            .text("FACTURA", 330, 46, { width: 215, align: "right", characterSpacing: 1.5 });
        doc.fontSize(26)
            .fillColor("#FFFFFF")
            .font("Helvetica-Bold")
            .text(`#${orderDetails.invoice_no}`, 330, 61, { width: 215, align: "right" });

        doc.font("Helvetica-Bold").fontSize(8);
        const pillTextWidth = doc.widthOfString(status.label);
        const pillWidth = pillTextWidth + 18;
        const pillX = PAGE_RIGHT - pillWidth;
        doc.roundedRect(pillX, 94, pillWidth, 16, 8).fill(status.bg);
        doc.fillColor(status.fg).text(status.label, pillX, 98, { width: pillWidth, align: "center" });

        doc.fontSize(9)
            .fillColor(mutedOnDark)
            .font("Helvetica")
            .text(
                `Emitida el ${new Date(orderDetails.order_date).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`,
                330,
                118,
                { width: 215, align: "right" }
            );

        // Bright gradient seam closing the band - the one line that's
        // pure brand color at full strength, same pair used on every
        // primary button in the app.
        const seamGrad = doc.linearGradient(0, HERO_HEIGHT - 3, 595, HERO_HEIGHT);
        seamGrad.stop(0, tealBright).stop(1, tealLight);
        doc.rect(0, HERO_HEIGHT - 3, 595, 3).fill(seamGrad);

        // --- Bill-to / order-detail grid --------------------------------
        const infoY = HERO_HEIGHT + 27;
        const eyebrow = (text, x, y, width) =>
            doc.fontSize(8.5)
                .fillColor(mutedColor)
                .font("Helvetica-Bold")
                .text(text, x, y, { width, characterSpacing: 0.6 });

        eyebrow("FACTURAR A", PAGE_LEFT, infoY, 240);
        doc.fontSize(13)
            .fillColor(inkColor)
            .font("Helvetica-Bold")
            .text(orderDetails.customer_name, PAGE_LEFT, infoY + 16, { width: 240 });
        doc.fontSize(9.5)
            .fillColor(mutedColor)
            .font("Helvetica")
            .text(orderDetails.customer_address, PAGE_LEFT, infoY + 34, { width: 240 })
            .text(`Tel. ${orderDetails.customer_phone}`, PAGE_LEFT, doc.y + 4, { width: 240 });

        const detailX = 330;
        const detailValueWidth = 215;
        eyebrow("DETALLES DEL PEDIDO", detailX, infoY, detailValueWidth);
        const detailRow = (label, value, y) => {
            doc.fontSize(9)
                .fillColor(mutedColor)
                .font("Helvetica")
                .text(label, detailX, y, { width: 110 });
            doc.fontSize(9)
                .fillColor(inkColor)
                .font("Helvetica-Bold")
                .text(value, detailX, y, { width: detailValueWidth, align: "right" });
        };
        detailRow("Artículos", String(orderDetails.total_products ?? orderDetails.orderItems.length), infoY + 18);
        detailRow("Atendido por", orderDetails.created_by, infoY + 34);

        // --- Line items --------------------------------------------------
        const tableTop = 275;
        doc.fontSize(8.5)
            .fillColor(inkTeal)
            .font("Helvetica-Bold")
            .text("PRODUCTO", PAGE_LEFT, tableTop, { characterSpacing: 0.5 })
            .text("CANT.", 330, tableTop, { width: 40, align: "center", characterSpacing: 0.5 })
            .text("PRECIO", 390, tableTop, { width: 75, align: "right", characterSpacing: 0.5 })
            .text("IMPORTE", 470, tableTop, { width: 75, align: "right", characterSpacing: 0.5 });

        hairline(tableTop + 16, inkTeal, 1.5);

        let rowY = tableTop + 28;
        const rowHeight = 27;

        orderDetails.orderItems.forEach((item) => {
            doc.fontSize(10)
                .fillColor(inkColor)
                .font("Helvetica-Bold")
                .text(item.product_name, PAGE_LEFT, rowY, { width: 260 });
            doc.fontSize(10)
                .fillColor(mutedColor)
                .font("Helvetica")
                .text(item.quantity.toString(), 330, rowY, { width: 40, align: "center" })
                .text(`$${item.unitcost.toFixed(2)}`, 390, rowY, { width: 75, align: "right" });
            doc.fillColor(inkColor)
                .font("Helvetica-Bold")
                .text(`$${item.total.toFixed(2)}`, 470, rowY, { width: 75, align: "right" });

            rowY += rowHeight;
            hairline(rowY - 9, lineColor, 0.75);
        });

        // --- Totals --------------------------------------------------------
        const totalsX = 330;
        const totalsWidth = PAGE_RIGHT - totalsX;
        let summaryY = rowY + 8;

        doc.fontSize(9.5)
            .fillColor(mutedColor)
            .font("Helvetica")
            .text("Subtotal", totalsX, summaryY, { width: 100 })
            .text(`$${orderDetails.sub_total.toFixed(2)}`, totalsX, summaryY, { width: totalsWidth, align: "right" });
        summaryY += 18;
        doc.text("Impuesto", totalsX, summaryY, { width: 100 })
            .text(
                `$${(orderDetails.total - orderDetails.sub_total).toFixed(2)}`,
                totalsX,
                summaryY,
                { width: totalsWidth, align: "right" }
            );

        // TOTAL gets its own dark panel instead of just a bigger number -
        // the same ink used for the hero band, so it reads as the page's
        // second (and final) beat rather than one more line in the list.
        summaryY += 24;
        const totalPanelHeight = 62;
        doc.roundedRect(totalsX, summaryY, totalsWidth, totalPanelHeight, 10).fill(inkColor);
        doc.fontSize(8.5)
            .fillColor(mutedOnDark)
            .font("Helvetica-Bold")
            .text("TOTAL A PAGAR", totalsX + 16, summaryY + 14, { characterSpacing: 0.8 });
        doc.fontSize(23)
            .fillColor(inkTeal)
            .font("Helvetica-Bold")
            .text(`$${orderDetails.total.toFixed(2)}`, totalsX, summaryY + 27, {
                width: totalsWidth - 16,
                align: "right",
            });
        summaryY += totalPanelHeight;

        // --- Footer --------------------------------------------------------
        const noteY = summaryY + 40;
        hairline(noteY);

        doc.fontSize(9)
            .fillColor(mutedColor)
            .font("Helvetica")
            .text("Incluye el número de factura como referencia de tu pago.", PAGE_LEFT, noteY + 16, {
                width: PAGE_WIDTH,
                align: "center",
            });
        doc.fontSize(13)
            .font("Helvetica-Bold")
            .fillColor(inkTeal)
            .text("¡Gracias por tu compra!", PAGE_LEFT, noteY + 32, { width: PAGE_WIDTH, align: "center" });

        // Escala+ custom footer text, set by the company in Admin.
        if (showCustomFooter && company?.pdfFooterText) {
            doc.fontSize(9)
                .fillColor(inkColor)
                .font("Helvetica")
                .text(company.pdfFooterText, PAGE_LEFT, 685, {
                    align: "center",
                    width: PAGE_WIDTH,
                });
        }

        doc.fontSize(8)
            .fillColor(mutedColor)
            .font("Helvetica")
            .text(`Ohnix by iTCycle · Factura #${orderDetails.invoice_no}`, PAGE_LEFT, 705, {
                align: "center",
                width: PAGE_WIDTH,
            });

        const pageCount = doc.bufferedPageCount;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
                .fillColor(mutedColor)
                .text(`Página ${i + 1} de ${pageCount}`, PAGE_LEFT, 720, {
                    align: "center",
                    width: PAGE_WIDTH,
                });
        }

        doc.end();
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    createOrder,
    getAllOrders,
    getAllOrdersAdmin,
    getOrderDetails,
    updateOrderStatus,
    getOrderReturnPreview,
    processOrderReturn,
    getOrderShippingPayload,
    generateInvoice,
};
