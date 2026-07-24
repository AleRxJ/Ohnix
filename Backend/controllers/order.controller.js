import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import orderService from "../services/order.service.js";
import PDFDocument from "pdfkit";
import { prisma } from "../db/prisma.js";

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
    });

const createOrder = asyncHandler(async (req, res, next) => {
    try {
        const order = await orderService.createOrder(
            req.body,
            req.user.prismaId,
            req.user.role
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
    const limitNum = Number.parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    try {
        const [orders, total] = await Promise.all([
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
        ]);

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
                },
                "Orders fetched successfully"
            )
        );
    } catch (err) {
        return next(new ApiError(500, err.message));
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
        return next(new ApiError(500, err.message));
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
            req.user.role
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

        if (req.user.role !== "admin" && order.createdById !== req.user.prismaId) {
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

        const primaryColor = "#34495e";
        const accentColor = "#3498db";
        const subtleColor = "#95a5a6";
        const highlightColor = "#2980b9";

        doc.fontSize(32)
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .text("Inventory", 50, 50, { continued: true })
            .fillColor(accentColor)
            .text("Pro", { align: "left" });

        doc.moveTo(50, 90)
            .lineTo(550, 90)
            .strokeColor(subtleColor)
            .lineWidth(0.5)
            .stroke();

        doc.fontSize(11)
            .fillColor(subtleColor)
            .font("Helvetica")
            .text("INVOICE", 50, 105);

        doc.fontSize(20)
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .text(`#${orderDetails.invoice_no}`, 50, 125);

        doc.fontSize(10)
            .fillColor(subtleColor)
            .font("Helvetica")
            .text(
                `Issued: ${new Date(orderDetails.order_date).toLocaleDateString()}`,
                50,
                150
            );

        doc.moveTo(50, 170).lineTo(550, 170).stroke(accentColor);

        const billingY = 190;
        doc.fontSize(11)
            .fillColor(subtleColor)
            .font("Helvetica")
            .text("BILL TO", 50, billingY);
        doc.fontSize(14)
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .text(orderDetails.customer_name, 50, billingY + 20);
        doc.fontSize(10)
            .fillColor(primaryColor)
            .font("Helvetica")
            .text(orderDetails.customer_address, 50, billingY + 40, {
                width: 200,
            })
            .text(`Phone: ${orderDetails.customer_phone}`, 50, doc.y + 10);

        const tableTop = 290;
        doc.rect(50, tableTop, 500, 30).fill("#f8f9fa");

        doc.fillColor(primaryColor)
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("ITEM", 70, tableTop + 10)
            .text("QUANTITY", 280, tableTop + 10)
            .text("PRICE", 375, tableTop + 10)
            .text("AMOUNT", 470, tableTop + 10);

        doc.moveTo(50, tableTop + 30)
            .lineTo(550, tableTop + 30)
            .stroke(subtleColor);

        let tableRowY = tableTop + 40;
        const lineHeight = 25;

        orderDetails.orderItems.forEach((item, index) => {
            doc.fillColor(primaryColor)
                .font("Helvetica")
                .fontSize(10)
                .text(item.product_name, 70, tableRowY, { width: 200 })
                .text(item.quantity.toString(), 300, tableRowY)
                .text(`$${item.unitcost.toFixed(2)}`, 370, tableRowY)
                .font("Helvetica-Bold")
                .text(`$${item.total.toFixed(2)}`, 470, tableRowY);

            tableRowY += lineHeight;

            if (index < orderDetails.orderItems.length - 1) {
                doc.moveTo(70, tableRowY - 5)
                    .lineTo(530, tableRowY - 5)
                    .strokeColor(subtleColor)
                    .opacity(0.3)
                    .lineWidth(0.5)
                    .stroke()
                    .opacity(1);
            }
        });

        const summaryY = tableRowY + 20;
        doc.moveTo(350, summaryY)
            .lineTo(550, summaryY)
            .strokeColor(subtleColor)
            .lineWidth(0.5)
            .stroke();

        doc.fillColor(primaryColor)
            .font("Helvetica")
            .fontSize(10)
            .text("Subtotal", 370, summaryY + 10)
            .text(`$${orderDetails.sub_total.toFixed(2)}`, 470, summaryY + 10, {
                align: "right",
            })
            .text("GST (18%)", 370, summaryY + 30)
            .text(
                `$${(orderDetails.total - orderDetails.sub_total).toFixed(2)}`,
                470,
                summaryY + 30,
                { align: "right" }
            );

        doc.moveTo(350, summaryY + 50)
            .lineTo(550, summaryY + 50)
            .strokeColor(subtleColor)
            .lineWidth(0.5)
            .stroke();
        doc.moveTo(350, summaryY + 52)
            .lineTo(550, summaryY + 52)
            .strokeColor(subtleColor)
            .lineWidth(0.5)
            .stroke();

        doc.font("Helvetica-Bold")
            .fontSize(14)
            .text("TOTAL", 370, summaryY + 60)
            .fillColor(highlightColor)
            .text(`$${orderDetails.total.toFixed(2)}`, 470, summaryY + 60, {
                align: "right",
            });

        const noteY = summaryY + 100;
        doc.moveTo(50, noteY).lineTo(550, noteY).stroke(subtleColor);

        doc.fillColor(primaryColor)
            .fontSize(10)
            .font("Helvetica")
            .text("Payment Information", 50, noteY + 20, { continued: true })
            .font("Helvetica-Bold")
            .text(": Please include the invoice number with your payment.");

        doc.fontSize(12)
            .font("Helvetica-Bold")
            .fillColor(accentColor)
            .text("Thank you for your business!", 50, noteY + 50);

        doc.fontSize(8)
            .fillColor(subtleColor)
            .font("Helvetica")
            .text(
                `Ohnix by iTCycle - Invoice #${orderDetails.invoice_no}`,
                50,
                700,
                {
                    align: "center",
                    width: 500,
                }
            );

        const pageCount = doc.bufferedPageCount;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
                .fillColor(subtleColor)
                .text(`Page ${i + 1} of ${pageCount}`, 50, 720, {
                    align: "center",
                    width: 500,
                });
        }

        doc.end();
    } catch (err) {
        return next(new ApiError(500, err.message));
    }
});

export {
    createOrder,
    getAllOrders,
    getAllOrdersAdmin,
    getOrderDetails,
    updateOrderStatus,
    generateInvoice,
};
