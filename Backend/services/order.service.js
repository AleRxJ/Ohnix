import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sendRealtimeLowStockAlert } from "../utils/lowStockScheduler.js";
import { issueElectronicInvoiceForOrder } from "./electronicInvoicing.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { getLowStockDefaultThreshold } from "../utils/systemSettings.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { claimLocationStock, creditLocationStock, getLocationStock } from "./productLocationStock.service.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";
import { postOrderSaleJournalEntry, postOrderReturnJournalEntry } from "./accountingPosting.service.js";

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
            pointOfSaleId: true,
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
            taxTreatment: true,
            lowStockThreshold: true,
            isPhysical: true,
            weightValue: true,
            volumetricWeight: true,
            packagingType: true,
            isFragile: true,
            // Read live at sale-completion time for the automatic COGS
            // journal line (accountingPosting.service.js) - not frozen per
            // OrderDetail like unitcost/tax fields are, since this codebase
            // has no historical cost-layer concept anywhere (no FIFO/
            // weighted-average), same simplification the Fase 4 plan
            // documents explicitly.
            buyingPrice: true,
        },
    });

// The order's tax total must always be derived from each product's own tax
// treatment (Product.taxTreatment/taxRate), never a flat assumed percentage -
// this is what gets validated against Factus/DIAN at invoicing time. On top
// of that, a company explicitly marked `not_responsible` for VAT (ET art.
// 437) never charges VAT on anything it sells, regardless of how any
// individual product is classified - that condition dominates the product's
// own treatment (see "El IVA en Ohnix" section 3). A company that hasn't
// configured its VAT responsibility yet (`unset`) keeps the pre-existing
// per-product behavior so this doesn't retroactively zero out totals for
// every company that predates this field.
// Resolves the effective treatment/rate/amount for a single line - the same
// values get frozen onto its OrderDetail row (see createOrder below) so
// nothing downstream ever has to redo this resolution against a Product/
// Company that may have since changed.
const computeItemTax = (item, companyCollectsVat) => {
    const treatment = companyCollectsVat ? item.product.taxTreatment : "excluded";
    if (treatment !== "taxed") {
        return { treatment, rate: 0, amount: 0 };
    }
    const rate = Number(item.product.taxRate) || 0;
    const lineTotal = item.quantity * item.unitcost;
    return { treatment, rate, amount: Number(((lineTotal * rate) / 100).toFixed(2)) };
};

const computeOrderTotals = (resolvedItems, { companyVatResponsible } = {}) => {
    let subTotal = 0;
    let gst = 0;
    const companyCollectsVat = companyVatResponsible !== "not_responsible";
    const itemTaxes = [];

    for (const item of resolvedItems) {
        const lineTotal = item.quantity * item.unitcost;
        subTotal += lineTotal;
        const itemTax = computeItemTax(item, companyCollectsVat);
        gst += itemTax.amount;
        itemTaxes.push(itemTax);
    }

    subTotal = Number(subTotal.toFixed(2));
    gst = Number(gst.toFixed(2));
    const total = Number((subTotal + gst).toFixed(2));

    return { subTotal, gst, total, itemTaxes };
};

const findOrderByAnyId = async (id) =>
    prisma.order.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            createdById: true,
            orderStatus: true,
            pointOfSaleId: true,
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
    async createOrder(orderData, userId, userRole, pointOfSaleId) {
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
        // Customers are scoped to the location they were created at (see
        // Customer.pointOfSaleId's 2026-08-21 scoping decision) - an order
        // placed at one PDV referencing a customer that belongs to another
        // is invalid regardless of whether the actor happens to have scope
        // over both, same as a product/supplier can't cross accounts.
        if (customer.pointOfSaleId !== pointOfSaleId) {
            throw new ApiError(403, "Este cliente pertenece a otro punto de venta.");
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
            // Available stock is now per-location, not the product's
            // account-wide total (item.product.stock) - a product can be
            // well-stocked overall and still have nothing at the specific
            // PointOfSale this order is for. This is a pre-check for a nice
            // batched error only; claimLocationStock inside the transaction
            // below is what's actually atomic against a concurrent request.
            const locationRows = await prisma.productLocationStock.findMany({
                where: {
                    pointOfSaleId,
                    productId: { in: resolvedItems.map((item) => item.product.id) },
                },
                select: { productId: true, stock: true },
            });
            const locationStockById = new Map(locationRows.map((row) => [row.productId, row.stock]));

            const insufficientItems = resolvedItems
                .filter((item) => (locationStockById.get(item.product.id) ?? 0) < item.quantity)
                .map((item) => {
                    const available = locationStockById.get(item.product.id) ?? 0;
                    return {
                        product_id: toExternalId(item.product),
                        product_name: item.product.productName,
                        product_code: item.product.productCode,
                        requested: item.quantity,
                        available,
                        reason: available === 0 ? "out_of_stock" : "insufficient_stock",
                    };
                });

            if (insufficientItems.length > 0) {
                throw new ApiError(
                    422,
                    "Insufficient stock for one or more products",
                    insufficientItems
                );
            }
        }

        const owner = await prisma.user.findUnique({
            where: { id: userId },
            select: { company: { select: { vatResponsible: true } } },
        });
        const { subTotal, gst, total, itemTaxes } = computeOrderTotals(resolvedItems, {
            companyVatResponsible: owner?.company?.vatResponsible,
        });

        const order = await prisma.$transaction(async (tx) => {
            const createdOrder = await tx.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId,
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

            for (const [index, item] of resolvedItems.entries()) {
                const itemTax = itemTaxes[index];
                await tx.orderDetail.create({
                    data: {
                        orderId: createdOrder.id,
                        productId: item.product.id,
                        quantity: item.quantity,
                        unitcost: item.unitcost,
                        total: item.quantity * item.unitcost,
                        taxTreatmentApplied: itemTax.treatment,
                        taxRateApplied: itemTax.rate,
                        taxAmount: itemTax.amount,
                        weightApplied: item.product.weightValue !== null ? Number(item.product.weightValue) : null,
                        volumetricWeightApplied:
                            item.product.volumetricWeight !== null ? Number(item.product.volumetricWeight) : null,
                    },
                });

                if (shouldDeductStock) {
                    // Claims at the (product, location) level, not the
                    // product's account-wide total - the stock read used for
                    // the pre-check above happened before this transaction
                    // started AND before location was even a dimension, so it
                    // cannot protect against a concurrent request taking the
                    // same location's stock in between. See
                    // productLocationStock.service.js#claimLocationStock for
                    // why this is still atomic.
                    const locationBalance = await claimLocationStock(tx, {
                        productId: item.product.id,
                        pointOfSaleId,
                        quantity: item.quantity,
                    });

                    if (locationBalance === null) {
                        const available = await getLocationStock(item.product.id, pointOfSaleId);
                        throw new ApiError(
                            422,
                            "Insufficient stock for one or more products",
                            [
                                {
                                    product_id: toExternalId(item.product),
                                    product_name: item.product.productName,
                                    product_code: item.product.productCode,
                                    requested: item.quantity,
                                    available,
                                    reason: "insufficient_stock",
                                },
                            ]
                        );
                    }

                    await recordStockMovement(tx, {
                        productId: item.product.id,
                        accountId: item.product.createdById,
                        pointOfSaleId,
                        delta: -item.quantity,
                        balanceAfter: locationBalance,
                        sourceType: "order",
                        sourceId: createdOrder.id,
                        createdById: userId,
                    });
                }
            }

            if (shouldDeductStock) {
                const cogs = resolvedItems.reduce(
                    (sum, item) => sum + item.quantity * Number(item.product.buyingPrice),
                    0
                );
                await postOrderSaleJournalEntry(tx, { accountId: userId, createdById: userId, order: createdOrder, cogs });
            }

            return createdOrder;
        });

        emitPosEvent(userId, pointOfSaleId, "order", "created");
        if (shouldDeductStock) emitPosEvent(userId, pointOfSaleId, "product", "stock-changed");

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

    async updateOrderStatus(orderId, newStatus, userId, userRole, actingUser) {
        const order = await findOrderByAnyId(orderId);

        if (!order) {
            throw new ApiError(404, "Order not found");
        }

        if (userRole !== "admin" && order.createdById !== userId) {
            throw new ApiError(403, "You are not authorized to update this order");
        }
        if (actingUser) assertPosAccess(actingUser, order.pointOfSaleId);

        const validTransitions = {
            pending: ["processing", "cancelled"],
            processing: ["completed", "cancelled"],
            // A completed sale can only be undone by cancelling it, which
            // reverses the stock deduction (see the cancelled branch below).
            // There is no "un-cancel" - a fresh order should be created instead.
            // "returned" is never a target here - it's only ever reached as a
            // side effect of processReturn() once every line has nothing left
            // pending. See that method.
            completed: ["cancelled"],
            cancelled: [],
            returned: [],
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
                    id: true,
                    quantity: true,
                    unitcost: true,
                    taxRateApplied: true,
                    returnedQuantity: true,
                    productId: true,
                    product: { select: { createdById: true, buyingPrice: true } },
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

                const journalLines = [];

                for (const detail of details) {
                    // Only restock/credit whatever is still outstanding on
                    // this line - a granular return (processReturn) may have
                    // already covered part of it before this cancellation was
                    // requested. Crediting the full original quantity again
                    // here would double-count stock already put back.
                    const pending = detail.quantity - detail.returnedQuantity;
                    if (pending <= 0) continue;

                    const locationBalance = await creditLocationStock(tx, {
                        productId: detail.productId,
                        pointOfSaleId: order.pointOfSaleId,
                        quantity: pending,
                    });

                    await recordStockMovement(tx, {
                        productId: detail.productId,
                        accountId: detail.product.createdById,
                        pointOfSaleId: order.pointOfSaleId,
                        delta: pending,
                        balanceAfter: locationBalance,
                        sourceType: "order_cancellation",
                        sourceId: order.id,
                        createdById: userId,
                    });

                    // Same optimistic claim as processReturn: guards against a
                    // concurrent granular return on this same line changing
                    // returnedQuantity between the read above and this write.
                    const detailClaim = await tx.orderDetail.updateMany({
                        where: { id: detail.id, returnedQuantity: detail.returnedQuantity },
                        data: {
                            returnDate: new Date(),
                            returnedQuantity: { increment: pending },
                            refundAmount: { increment: pending * Number(detail.unitcost) },
                        },
                    });

                    if (detailClaim.count === 0) {
                        throw new ApiError(
                            409,
                            "This order was updated by another request. Please refresh and try again."
                        );
                    }

                    // Pushed only after the claim above succeeds - a mid-loop
                    // throw rolls back the whole tx, so nothing here ever gets
                    // posted for a line that wasn't actually claimed.
                    journalLines.push({
                        quantity: pending,
                        unitcost: detail.unitcost,
                        taxRateApplied: detail.taxRateApplied,
                        buyingPrice: detail.product.buyingPrice,
                    });
                }

                if (journalLines.length > 0) {
                    await postOrderReturnJournalEntry(tx, {
                        accountId: order.createdById,
                        createdById: userId,
                        sourceType: "order_cancellation",
                        sourceId: order.id,
                        entryDate: new Date(),
                        description: `Cancelación de pedido`,
                        lines: journalLines,
                    });
                }

                return tx.order.findUniqueOrThrow({ where: { id: order.id } });
            });

            emitPosEvent(order.createdById, order.pointOfSaleId, "order", "updated");
            emitPosEvent(order.createdById, order.pointOfSaleId, "product", "stock-changed");

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
                            buyingPrice: true,
                        },
                    },
                },
            });

            const locationRowsForCompletion = await prisma.productLocationStock.findMany({
                where: { pointOfSaleId: order.pointOfSaleId, productId: { in: details.map((d) => d.product.id) } },
                select: { productId: true, stock: true },
            });
            const locationStockForCompletion = new Map(locationRowsForCompletion.map((r) => [r.productId, r.stock]));

            const insufficientItems = details
                .filter((d) => (locationStockForCompletion.get(d.product.id) ?? 0) < d.quantity)
                .map((d) => {
                    const available = locationStockForCompletion.get(d.product.id) ?? 0;
                    return {
                        product_id: toExternalId(d.product),
                        product_name: d.product.productName,
                        product_code: d.product.productCode,
                        requested: d.quantity,
                        available,
                        reason: available === 0 ? "out_of_stock" : "insufficient_stock",
                    };
                });

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
                    // Same guarded claim as createOrder, against the
                    // location now instead of the product's account-wide
                    // total: the stock read above predates this transaction,
                    // so a concurrent completion of another order for the
                    // same product/location could otherwise race past this
                    // check and oversell.
                    const locationBalance = await claimLocationStock(tx, {
                        productId: detail.product.id,
                        pointOfSaleId: order.pointOfSaleId,
                        quantity: detail.quantity,
                    });

                    if (locationBalance === null) {
                        const available = await getLocationStock(detail.product.id, order.pointOfSaleId);
                        throw new ApiError(
                            422,
                            "Insufficient stock for one or more products",
                            [
                                {
                                    product_id: toExternalId(detail.product),
                                    product_name: detail.product.productName,
                                    product_code: detail.product.productCode,
                                    requested: detail.quantity,
                                    available,
                                    reason: "insufficient_stock",
                                },
                            ]
                        );
                    }

                    await recordStockMovement(tx, {
                        productId: detail.product.id,
                        accountId: detail.product.createdById,
                        pointOfSaleId: order.pointOfSaleId,
                        delta: -detail.quantity,
                        balanceAfter: locationBalance,
                        sourceType: "order",
                        sourceId: order.id,
                        createdById: userId,
                    });
                }

                const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

                const cogs = details.reduce(
                    (sum, detail) => sum + detail.quantity * Number(detail.product.buyingPrice),
                    0
                );
                await postOrderSaleJournalEntry(tx, {
                    accountId: order.createdById,
                    createdById: userId,
                    order: updatedOrder,
                    cogs,
                });

                return updatedOrder;
            });

            if (!updated.isTutorialData) {
                triggerElectronicInvoicingIfCompleted({
                    orderId: updated.id,
                    userId,
                    userRole,
                    trigger: "order_status_completed",
                });
            }

            emitPosEvent(order.createdById, order.pointOfSaleId, "order", "updated");
            emitPosEvent(order.createdById, order.pointOfSaleId, "product", "stock-changed");

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

        emitPosEvent(order.createdById, order.pointOfSaleId, "order", "updated");

        return {
            _id: toExternalId(updated),
            order_status: updated.orderStatus,
            updatedAt: updated.updatedAt,
        };
    }

    // Explicit, per-line sales return: the caller picks which sold lines to
    // credit back and how much of each, instead of the only previous
    // "undo a sale" tool (full cancellation). Can be called more than once
    // per order while any line still has quantity - returnedQuantity left.
    // Unlike purchase returns, crediting a sale back always *increases*
    // stock, so there's no stock-availability ceiling to enforce - only how
    // much of the line is still outstanding. orderStatus only flips to
    // "returned" once every line has nothing left pending - see the schema
    // comment on OrderDetail for why returnedQuantity/refundAmount are
    // running totals, same as PurchaseDetail.
    async processReturn(orderId, lines, userId, userRole, actingUser) {
        const order = await findOrderByAnyId(orderId);

        if (!order) {
            throw new ApiError(404, "Order not found");
        }

        if (userRole !== "admin" && order.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to return items from this order");
        }
        if (actingUser) assertPosAccess(actingUser, order.pointOfSaleId);

        if (order.orderStatus !== "completed") {
            throw new ApiError(
                400,
                order.orderStatus === "returned"
                    ? "This order has already been fully returned"
                    : "Only completed orders can be returned",
                [],
                "",
                "order_not_returnable"
            );
        }

        // Same requirement as cancellation above: an issued/accepted
        // electronic invoice is a DIAN-facing legal document, so a granular
        // return can't silently adjust stock/refunds behind it either.
        // Credit notes are the correct path once an invoice has gone out
        // (not yet wired to restock automatically).
        if (["submitted", "accepted"].includes(order.electronicInvoice?.status)) {
            throw new ApiError(
                409,
                "This order has an issued electronic invoice. Issue a credit note instead of returning items directly."
            );
        }

        if (!Array.isArray(lines) || lines.length === 0) {
            throw new ApiError(400, "At least one return line is required");
        }

        const detailIds = lines.map((l) => l.order_detail_id?.toString()).filter(Boolean);
        const uniqueDetailIds = [...new Set(detailIds)];
        if (detailIds.length !== lines.length || uniqueDetailIds.length !== detailIds.length) {
            throw new ApiError(400, "Duplicate or missing order detail id in return request");
        }

        for (const line of lines) {
            const quantity = Number(line.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new ApiError(400, "Quantity must be a positive integer for every return line");
            }
        }

        // Matched by id OR legacyMongoId, same "any id" pattern used
        // throughout this service and purchase.service.js#processReturn.
        const details = await prisma.orderDetail.findMany({
            where: {
                orderId: order.id,
                OR: [{ id: { in: uniqueDetailIds } }, { legacyMongoId: { in: uniqueDetailIds } }],
            },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        createdById: true,
                        buyingPrice: true,
                    },
                },
            },
        });

        if (details.length !== uniqueDetailIds.length) {
            throw new ApiError(400, "One or more return lines do not belong to this order");
        }

        const detailById = new Map(details.map((d) => [toExternalId(d), d]));

        const insufficientItems = [];
        for (const line of lines) {
            const detail = detailById.get(line.order_detail_id);
            const pending = detail.quantity - detail.returnedQuantity;
            if (Number(line.quantity) > pending) {
                insufficientItems.push({
                    order_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    requested: Number(line.quantity),
                    available: Math.max(pending, 0),
                    reason: "exceeds_pending_quantity",
                });
            }
        }

        if (insufficientItems.length > 0) {
            throw new ApiError(
                422,
                "One or more return lines exceed what can be returned",
                insufficientItems
            );
        }

        const { results, orderFullyReturned } = await prisma.$transaction(async (tx) => {
            const results = [];
            const journalLines = [];

            for (const line of lines) {
                const detail = detailById.get(line.order_detail_id);
                const quantity = Number(line.quantity);

                const locationBalance = await creditLocationStock(tx, {
                    productId: detail.product.id,
                    pointOfSaleId: order.pointOfSaleId,
                    quantity,
                });

                await recordStockMovement(tx, {
                    productId: detail.product.id,
                    accountId: detail.product.createdById,
                    pointOfSaleId: order.pointOfSaleId,
                    delta: quantity,
                    balanceAfter: locationBalance,
                    sourceType: "order_return",
                    sourceId: order.id,
                    createdById: userId,
                });

                const refundNow = quantity * Number(detail.unitcost);

                // Same claim idiom as purchase.service.js#processReturn: the
                // returnedQuantity read that fed the insufficientItems check
                // predates this transaction, so without this guard two
                // concurrent returns on the same line could each pass
                // validation and both increment it past quantity.
                const detailClaim = await tx.orderDetail.updateMany({
                    where: { id: detail.id, returnedQuantity: detail.returnedQuantity },
                    data: {
                        returnDate: new Date(),
                        returnedQuantity: { increment: quantity },
                        refundAmount: { increment: refundNow },
                    },
                });

                if (detailClaim.count === 0) {
                    throw new ApiError(
                        409,
                        `"${detail.product.productName}" was returned by another request. Please refresh and try again.`
                    );
                }

                const updatedDetail = await tx.orderDetail.findUniqueOrThrow({
                    where: { id: detail.id },
                    select: { returnedQuantity: true, refundAmount: true },
                });

                results.push({
                    order_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    returned_now: quantity,
                    refund_now: refundNow,
                    returned_quantity: updatedDetail.returnedQuantity,
                    refund_amount: Number(updatedDetail.refundAmount),
                    pending_quantity: detail.quantity - updatedDetail.returnedQuantity,
                    fully_returned: updatedDetail.returnedQuantity === detail.quantity,
                });

                // Pushed only after the claim above succeeds, same reasoning
                // as the cancellation branch: a mid-loop throw rolls back the
                // whole tx before anything gets posted.
                journalLines.push({
                    quantity,
                    unitcost: detail.unitcost,
                    taxRateApplied: detail.taxRateApplied,
                    buyingPrice: detail.product.buyingPrice,
                });
            }

            const allDetails = await tx.orderDetail.findMany({
                where: { orderId: order.id },
                select: { quantity: true, returnedQuantity: true },
            });
            const orderFullyReturned = allDetails.every(
                (d) => d.returnedQuantity === d.quantity
            );

            if (orderFullyReturned) {
                await tx.order.updateMany({
                    where: { id: order.id, orderStatus: "completed" },
                    data: { orderStatus: "returned", updatedById: userId },
                });
            }

            await postOrderReturnJournalEntry(tx, {
                accountId: order.createdById,
                createdById: userId,
                sourceType: "order_return",
                sourceId: order.id,
                entryDate: new Date(),
                description: `Devolución de pedido`,
                lines: journalLines,
            });

            return { results, orderFullyReturned };
        });

        emitPosEvent(order.createdById, order.pointOfSaleId, "order", "updated");
        emitPosEvent(order.createdById, order.pointOfSaleId, "product", "stock-changed");

        return {
            order_id: toExternalId(order),
            order_status: orderFullyReturned ? "returned" : "completed",
            order_fully_returned: orderFullyReturned,
            total_refund_amount: results.reduce((sum, r) => sum + r.refund_now, 0),
            return_details: results,
        };
    }

    // Carrier-agnostic package list for this order - the payload a future
    // shipping-carrier adapter would translate into its own API's format
    // (see the physical-characteristics design: this model never speaks a
    // specific carrier's vocabulary, only grams/cm/booleans). One package
    // per order line on purpose - consolidating several lines into a single
    // real box is an operational packing decision the person packing the
    // order makes, not something this payload should guess at.
    async buildShippingPayload(orderId, userId, userRole, actingUser) {
        const order = await prisma.order.findFirst({
            where: { OR: [{ id: orderId }, { legacyMongoId: orderId }] },
            include: {
                customer: {
                    select: { id: true, legacyMongoId: true, name: true, phone: true, address: true },
                },
            },
        });

        if (!order) {
            throw new ApiError(404, "Order not found");
        }
        if (userRole !== "admin" && order.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to view this order's shipping payload");
        }
        if (actingUser) assertPosAccess(actingUser, order.pointOfSaleId);

        const details = await prisma.orderDetail.findMany({
            where: { orderId: order.id },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        isPhysical: true,
                        packagingType: true,
                        isFragile: true,
                        weightValue: true,
                        heightValue: true,
                        widthValue: true,
                        lengthValue: true,
                        packageWeightValue: true,
                        packageHeightValue: true,
                        packageWidthValue: true,
                        packageLengthValue: true,
                    },
                },
            },
        });

        const packages = [];
        for (const detail of details) {
            const product = detail.product;
            // Not physical (or sold before physical characteristics
            // existed and never backfilled) - nothing for a carrier to
            // weigh or box.
            if (!product?.isPhysical) continue;

            // Already-placed orders use the frozen weightApplied/
            // volumetricWeightApplied (per unit, at sale time) instead of
            // the product's current numbers - same reasoning as
            // taxRateApplied, so editing the product later never rewrites
            // what a shipment for this order already reports.
            const unitWeightGrams =
                detail.weightApplied !== null ? Number(detail.weightApplied) : Number(product.weightValue ?? 0);
            const unitVolumetricWeightGrams =
                detail.volumetricWeightApplied !== null
                    ? Number(detail.volumetricWeightApplied)
                    : Number(product.volumetricWeight ?? 0);

            // Package-for-dispatch dimensions/weight fall back to the
            // unit's own numbers when no override was set - see
            // Product.packageWeightValue's schema comment.
            const packageUnitWeightGrams =
                product.packageWeightValue !== null ? Number(product.packageWeightValue) : unitWeightGrams;
            const heightCm =
                product.packageHeightValue !== null ? Number(product.packageHeightValue) : Number(product.heightValue ?? 0);
            const widthCm =
                product.packageWidthValue !== null ? Number(product.packageWidthValue) : Number(product.widthValue ?? 0);
            const lengthCm =
                product.packageLengthValue !== null ? Number(product.packageLengthValue) : Number(product.lengthValue ?? 0);

            const billableUnitWeightGrams = Math.max(packageUnitWeightGrams, unitVolumetricWeightGrams);

            packages.push({
                product_id: toExternalId(product),
                product_name: product.productName,
                quantity: detail.quantity,
                weight_grams: Number((packageUnitWeightGrams * detail.quantity).toFixed(2)),
                volumetric_weight_grams: Number((unitVolumetricWeightGrams * detail.quantity).toFixed(2)),
                billable_weight_grams: Number((billableUnitWeightGrams * detail.quantity).toFixed(2)),
                height_cm: heightCm,
                width_cm: widthCm,
                length_cm: lengthCm,
                packaging_type: product.packagingType,
                is_fragile: product.isFragile,
            });
        }

        return {
            order_id: toExternalId(order),
            order_reference: order.invoiceNo,
            point_of_sale_id: order.pointOfSaleId,
            // No address model exists yet for either side of a shipment
            // (Customer only has a free-text address, Company has none at
            // all) - a future carrier integration resolves origin/
            // destination itself; this only hands over what already exists.
            destination: order.customer
                ? {
                      customer_id: toExternalId(order.customer),
                      name: order.customer.name,
                      phone: order.customer.phone,
                      address: order.customer.address,
                  }
                : null,
            packages,
            has_shippable_items: packages.length > 0,
        };
    }
}

export default new OrderService();
