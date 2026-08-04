import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sendRealtimeLowStockAlert } from "../utils/lowStockScheduler.js";
import { issueElectronicInvoiceForOrder } from "./electronicInvoicing.service.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const generateInvoiceNo = () => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${ts}${rand}`.substring(0, 10);
};

const findCustomerByAnyId = async (id) =>
    prisma.customer.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            createdById: true,
        },
    });

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            productName: true,
            productCode: true,
            createdById: true,
            stock: true,
            taxRate: true,
            taxCode: true,
            isTaxExcluded: true,
        },
    });

// The order's tax total must always be derived from each product's own tax
// rate (Product.taxRate/isTaxExcluded), never a flat assumed percentage -
// this is what gets validated against Factus/DIAN at invoicing time.
const computeOrderTotals = (resolvedItems) => {
    let subTotal = 0;
    let gst = 0;

    for (const item of resolvedItems) {
        const lineTotal = item.quantity * item.unitcost;
        subTotal += lineTotal;
        if (!item.product.isTaxExcluded) {
            const rate = Number(item.product.taxRate) || 0;
            gst += (lineTotal * rate) / 100;
        }
    }

    subTotal = Number(subTotal.toFixed(2));
    gst = Number(gst.toFixed(2));
    const total = Number((subTotal + gst).toFixed(2));

    return { subTotal, gst, total };
};

const findOrderByAnyId = async (id) =>
    prisma.order.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            createdById: true,
            orderStatus: true,
        },
    });

const triggerElectronicInvoicingIfCompleted = ({ orderId, userId, userRole, trigger }) => {
    issueElectronicInvoiceForOrder({
        orderId,
        requesterUserId: userId,
        requesterRole: userRole,
        trigger,
    }).catch((error) => {
        console.warn("[electronic-invoicing] async issuance skipped/failed", {
            orderId,
            trigger,
            message: error?.message || error,
        });
    });
};

class OrderService {
    async createOrder(orderData, userId, userRole) {
        const { customer_id, order_status, orderItems } = orderData;

        if (!customer_id || !Array.isArray(orderItems) || orderItems.length === 0) {
            throw new ApiError(400, "Invalid order data");
        }

        const customer = await findCustomerByAnyId(customer_id);
        if (!customer) {
            throw new ApiError(404, "Customer not found");
        }

        if (userRole !== "admin" && customer.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to use this customer");
        }

        for (const item of orderItems) {
            if (!item.product_id || !item.quantity || !item.unitcost) {
                throw new ApiError(400, "Invalid order item data");
            }
            if (Number(item.quantity) < 1) {
                throw new ApiError(400, "Quantity must be at least 1");
            }
            if (Number(item.unitcost) < 0) {
                throw new ApiError(400, "Unit cost must be non-negative");
            }
        }

        let invoiceNo;
        let attempts = 0;
        do {
            invoiceNo = generateInvoiceNo();
            const existing = await prisma.order.findUnique({
                where: { invoiceNo },
                select: { id: true },
            });
            if (!existing) break;
            attempts += 1;
        } while (attempts < 5);

        if (attempts >= 5) {
            throw new ApiError(
                500,
                "Failed to generate a unique invoice number. Please try again."
            );
        }

        const initialStatus = order_status || "pending";
        const shouldDeductStock = initialStatus === "completed";

        const resolvedItems = [];
        for (const item of orderItems) {
            const product = await findProductByAnyId(item.product_id);
            if (!product) {
                throw new ApiError(400, "One or more products not found");
            }
            if (userRole !== "admin" && product.createdById !== userId) {
                throw new ApiError(403, "You don't have permission to use one or more products");
            }
            resolvedItems.push({
                product,
                quantity: Number(item.quantity),
                unitcost: Number(item.unitcost),
            });
        }

        if (shouldDeductStock) {
            const insufficientItems = resolvedItems
                .filter((item) => item.product.stock < item.quantity)
                .map((item) => ({
                    product_id: toExternalId(item.product),
                    product_name: item.product.productName,
                    product_code: item.product.productCode,
                    requested: item.quantity,
                    available: item.product.stock,
                    reason:
                        item.product.stock === 0 ? "out_of_stock" : "insufficient_stock",
                }));

            if (insufficientItems.length > 0) {
                throw new ApiError(
                    422,
                    "Insufficient stock for one or more products",
                    insufficientItems
                );
            }
        }

        const { subTotal, gst, total } = computeOrderTotals(resolvedItems);

        const order = await prisma.$transaction(async (tx) => {
            const createdOrder = await tx.order.create({
                data: {
                    customerId: customer.id,
                    orderDate: new Date(),
                    orderStatus: initialStatus,
                    totalProducts: orderItems.length,
                    subTotal,
                    gst,
                    total,
                    invoiceNo,
                    createdById: userId,
                    updatedById: userId,
                },
            });

            for (const item of resolvedItems) {
                await tx.orderDetail.create({
                    data: {
                        orderId: createdOrder.id,
                        productId: item.product.id,
                        quantity: item.quantity,
                        unitcost: item.unitcost,
                        total: item.quantity * item.unitcost,
                    },
                });

                if (shouldDeductStock) {
                    await tx.product.update({
                        where: { id: item.product.id },
                        data: {
                            stock: { decrement: item.quantity },
                        },
                    });
                }
            }

            return createdOrder;
        });

        // Check for low stock after deduction and alert (fire and forget)
        if (shouldDeductStock) {
            const LOW_STOCK_THRESHOLD = 10;
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, username: true, preferredLanguage: true },
            });
            if (user) {
                const lowItems = resolvedItems
                    .map((item) => ({
                        productName: item.product.productName,
                        productCode: item.product.productCode,
                        stock: item.product.stock - item.quantity,
                        userEmail: user.email,
                        username: user.username,
                        locale: user.preferredLanguage,
                    }))
                    .filter((item) => item.stock >= 0 && item.stock < LOW_STOCK_THRESHOLD);
                if (lowItems.length > 0) {
                    sendRealtimeLowStockAlert(lowItems).catch(() => {});
                }
            }

            triggerElectronicInvoicingIfCompleted({
                orderId: order.id,
                userId,
                userRole,
                trigger: "order_create_completed",
            });
        }

        return {
            _id: toExternalId(order),
            customer_id,
            order_date: order.orderDate,
            order_status: order.orderStatus,
            total_products: order.totalProducts,
            sub_total: Number(order.subTotal),
            gst: Number(order.gst),
            total: Number(order.total),
            invoice_no: order.invoiceNo,
            created_by: userId,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
        };
    }

    async updateOrderStatus(orderId, newStatus, userId, userRole) {
        const order = await findOrderByAnyId(orderId);

        if (!order) {
            throw new ApiError(404, "Order not found");
        }

        if (userRole !== "admin" && order.createdById !== userId) {
            throw new ApiError(403, "You are not authorized to update this order");
        }

        const validTransitions = {
            pending: ["processing", "cancelled"],
            processing: ["completed", "cancelled"],
            completed: [],
            cancelled: [],
        };

        if (!validTransitions[order.orderStatus]?.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition order from "${order.orderStatus}" to "${newStatus}"`
            );
        }

        if (newStatus === "completed") {
            const details = await prisma.orderDetail.findMany({
                where: { orderId: order.id },
                include: {
                    product: {
                        select: {
                            id: true,
                            legacyMongoId: true,
                            productName: true,
                            productCode: true,
                            stock: true,
                        },
                    },
                },
            });

            const insufficientItems = details
                .filter((d) => d.product.stock < d.quantity)
                .map((d) => ({
                    product_id: toExternalId(d.product),
                    product_name: d.product.productName,
                    product_code: d.product.productCode,
                    requested: d.quantity,
                    available: d.product.stock,
                    reason:
                        d.product.stock === 0 ? "out_of_stock" : "insufficient_stock",
                }));

            if (insufficientItems.length > 0) {
                throw new ApiError(
                    422,
                    "Insufficient stock for one or more products",
                    insufficientItems
                );
            }

            const updated = await prisma.$transaction(async (tx) => {
                for (const detail of details) {
                    await tx.product.update({
                        where: { id: detail.product.id },
                        data: {
                            stock: { decrement: detail.quantity },
                        },
                    });
                }

                return tx.order.update({
                    where: { id: order.id },
                    data: {
                        orderStatus: newStatus,
                        updatedById: userId,
                    },
                });
            });

            triggerElectronicInvoicingIfCompleted({
                orderId: updated.id,
                userId,
                userRole,
                trigger: "order_status_completed",
            });

            return {
                _id: toExternalId(updated),
                order_status: updated.orderStatus,
                updatedAt: updated.updatedAt,
            };
        }

        const updated = await prisma.order.update({
            where: { id: order.id },
            data: {
                orderStatus: newStatus,
                updatedById: userId,
            },
        });

        return {
            _id: toExternalId(updated),
            order_status: updated.orderStatus,
            updatedAt: updated.updatedAt,
        };
    }
}

export default new OrderService();
