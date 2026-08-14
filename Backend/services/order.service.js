import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sendRealtimeLowStockAlert } from "../utils/lowStockScheduler.js";
import { issueElectronicInvoiceForOrder } from "./electronicInvoicing.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { getLowStockDefaultThreshold } from "../utils/systemSettings.js";
import { recordStockMovement } from "./stockMovement.service.js";

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
            lowStockThreshold: true,
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
            electronicInvoice: { select: { status: true } },
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
        const { customer_id, order_status, orderItems, is_tutorial_data } = orderData;

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
            if (
                !item.product_id ||
                item.quantity === undefined ||
                item.quantity === null ||
                item.unitcost === undefined ||
                item.unitcost === null
            ) {
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
                    isTutorialData: is_tutorial_data === true,
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
                    // Guarded conditional update instead of a plain decrement:
                    // the stock read used for the pre-check above happened
                    // before this transaction started, so it cannot protect
                    // against a concurrent request decrementing the same
                    // product in between. Requiring stock >= quantity in the
                    // WHERE clause makes the claim atomic - if another
                    // transaction already took the stock, count is 0 here
                    // and the whole order rolls back instead of overselling.
                    const claim = await tx.product.updateMany({
                        where: { id: item.product.id, stock: { gte: item.quantity } },
                        data: {
                            stock: { decrement: item.quantity },
                        },
                    });

                    if (claim.count === 0) {
                        throw new ApiError(
                            422,
                            "Insufficient stock for one or more products",
                            [
                                {
                                    product_id: toExternalId(item.product),
                                    product_name: item.product.productName,
                                    product_code: item.product.productCode,
                                    requested: item.quantity,
                                    available: null,
                                    reason: "insufficient_stock",
                                },
                            ]
                        );
                    }

                    const updatedProduct = await tx.product.findUniqueOrThrow({
                        where: { id: item.product.id },
                        select: { stock: true },
                    });

                    await recordStockMovement(tx, {
                        productId: item.product.id,
                        accountId: item.product.createdById,
                        delta: -item.quantity,
                        balanceAfter: updatedProduct.stock,
                        sourceType: "order",
                        sourceId: createdOrder.id,
                        createdById: userId,
                    });
                }
            }

            return createdOrder;
        });

        // Check for low stock after deduction and alert (fire and forget)
        if (shouldDeductStock) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, username: true, preferredLanguage: true },
            });
            if (user) {
                const defaultThreshold = await getLowStockDefaultThreshold();
                const lowItems = resolvedItems
                    .map((item) => ({
                        productName: item.product.productName,
                        productCode: item.product.productCode,
                        stock: item.product.stock - item.quantity,
                        // Escala+ can override the account-wide default per product.
                        threshold: item.product.lowStockThreshold ?? defaultThreshold,
                        userEmail: user.email,
                        username: user.username,
                        locale: user.preferredLanguage,
                    }))
                    .filter((item) => item.stock >= 0 && item.stock < item.threshold);
                if (lowItems.length > 0) {
                    // autoEmailAlerts is a Negocio+ feature (see pricing.middleware.js) -
                    // the weekly digest in lowStockScheduler.js already filters
                    // plan !== "starter", but this real-time path had no such
                    // check and was emailing every plan, Starter included.
                    ensureUserSubscription(userId)
                        .then((subscription) => {
                            if (getPlanFeatures(getEffectivePlan(subscription)).autoEmailAlerts) {
                                sendRealtimeLowStockAlert(lowItems).catch(() => {});
                            }
                        })
                        .catch(() => {});
                }
            }

            // Practice orders created by the "how does Ohnix work" tour must
            // never reach DIAN - it's a real government-facing document, not
            // something a synthetic tutorial sale should ever generate.
            if (!order.isTutorialData) {
                triggerElectronicInvoicingIfCompleted({
                    orderId: order.id,
                    userId,
                    userRole,
                    trigger: "order_create_completed",
                });
            }
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
            // A completed sale can only be undone by cancelling it, which
            // reverses the stock deduction (see the cancelled branch below).
            // There is no "un-cancel" - a fresh order should be created instead.
            completed: ["cancelled"],
            cancelled: [],
        };

        if (!validTransitions[order.orderStatus]?.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition order from "${order.orderStatus}" to "${newStatus}"`,
                [],
                "",
                "invalid_order_status_transition"
            );
        }

        if (order.orderStatus === "completed" && newStatus === "cancelled") {
            // An issued/accepted electronic invoice is a DIAN-facing legal
            // document - cancelling the order locally without voiding it
            // properly would desync Ohnix from what was actually reported.
            // Credit notes (already supported per order) are the correct
            // undo path once an invoice has gone out; block here instead of
            // silently leaving a stale accepted invoice behind.
            if (["submitted", "accepted"].includes(order.electronicInvoice?.status)) {
                throw new ApiError(
                    409,
                    "This order has an issued electronic invoice. Issue a credit note instead of cancelling it directly."
                );
            }

            const details = await prisma.orderDetail.findMany({
                where: { orderId: order.id },
                select: {
                    quantity: true,
                    productId: true,
                    product: { select: { createdById: true } },
                },
            });

            const updated = await prisma.$transaction(async (tx) => {
                // Guard the same way purchase.service.js does: claim the
                // "completed -> cancelled" transition atomically so two
                // concurrent cancel requests for the same order can't both
                // pass the check above and both restock it.
                const claim = await tx.order.updateMany({
                    where: { id: order.id, orderStatus: "completed" },
                    data: { orderStatus: "cancelled", updatedById: userId },
                });

                if (claim.count === 0) {
                    throw new ApiError(
                        409,
                        "This order was already updated by another request. Please refresh and try again."
                    );
                }

                for (const detail of details) {
                    const updatedProduct = await tx.product.update({
                        where: { id: detail.productId },
                        data: { stock: { increment: detail.quantity } },
                        select: { stock: true },
                    });

                    await recordStockMovement(tx, {
                        productId: detail.productId,
                        accountId: detail.product.createdById,
                        delta: detail.quantity,
                        balanceAfter: updatedProduct.stock,
                        sourceType: "order_cancellation",
                        sourceId: order.id,
                        createdById: userId,
                    });
                }

                return tx.order.findUniqueOrThrow({ where: { id: order.id } });
            });

            return {
                _id: toExternalId(updated),
                order_status: updated.orderStatus,
                updatedAt: updated.updatedAt,
            };
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
                            createdById: true,
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
                // Claim the "processing -> completed" transition atomically,
                // same as the "completed -> cancelled" branch above: two
                // concurrent completion requests for the same order could
                // otherwise both pass the transition check at the top of
                // this function (which reads the order before this
                // transaction starts) and both decrement stock for the same
                // order. Claiming first means the loser gets a clean 409
                // and its transaction rolls back before touching stock.
                const claim = await tx.order.updateMany({
                    where: { id: order.id, orderStatus: "processing" },
                    data: { orderStatus: newStatus, updatedById: userId },
                });

                if (claim.count === 0) {
                    throw new ApiError(
                        409,
                        "This order was already updated by another request. Please refresh and try again."
                    );
                }

                for (const detail of details) {
                    // Same guarded claim as createOrder: the stock read above
                    // predates this transaction, so a concurrent completion
                    // of another order for the same product could otherwise
                    // race past this check and oversell.
                    const claim = await tx.product.updateMany({
                        where: { id: detail.product.id, stock: { gte: detail.quantity } },
                        data: {
                            stock: { decrement: detail.quantity },
                        },
                    });

                    if (claim.count === 0) {
                        throw new ApiError(
                            422,
                            "Insufficient stock for one or more products",
                            [
                                {
                                    product_id: toExternalId(detail.product),
                                    product_name: detail.product.productName,
                                    product_code: detail.product.productCode,
                                    requested: detail.quantity,
                                    available: null,
                                    reason: "insufficient_stock",
                                },
                            ]
                        );
                    }

                    const updatedProduct = await tx.product.findUniqueOrThrow({
                        where: { id: detail.product.id },
                        select: { stock: true },
                    });

                    await recordStockMovement(tx, {
                        productId: detail.product.id,
                        accountId: detail.product.createdById,
                        delta: -detail.quantity,
                        balanceAfter: updatedProduct.stock,
                        sourceType: "order",
                        sourceId: order.id,
                        createdById: userId,
                    });
                }

                return tx.order.findUniqueOrThrow({ where: { id: order.id } });
            });

            if (!updated.isTutorialData) {
                triggerElectronicInvoicingIfCompleted({
                    orderId: updated.id,
                    userId,
                    userRole,
                    trigger: "order_status_completed",
                });
            }

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
