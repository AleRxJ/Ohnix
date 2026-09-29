import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";
import { emitPosEvent } from "../live/dataEvents.js";

// "Ventas sin documento" - sales the seller chose to "Emitir después"
// (Order.einvoiceDeferredAt) that still have no DIAN document. Issuing one
// goes through the ordinary POST /orders/:id/electronic-invoice/issue, so the
// same claim/numbering/idempotency guarantees apply as an immediate issue.

// The customer fields DIAN issuance requires (mirrors itcycleFiscalErrors in
// electronicInvoicing.service.js) - checked up front so the list can say
// "falta el NIT" instead of letting the send fail.
const FISCAL_FIELDS = ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"];
const missingFiscalFields = (customer) => FISCAL_FIELDS.filter((field) => !String(customer?.[field] ?? "").trim());

const scopedWhere = (user) => ({
    createdById: user.prismaId,
    ...(user.role !== "admin" && !user.posScopeAll ? { pointOfSaleId: { in: user.posScopeIds || [] } } : {}),
});

export const listPendingEinvoices = async ({ user }) => {
    const orders = await prisma.order.findMany({
        where: {
            ...scopedWhere(user),
            einvoiceDeferredAt: { not: null },
            electronicInvoice: null,
            orderStatus: { not: "cancelled" },
        },
        include: {
            customer: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    name: true,
                    type: true,
                    identification: true,
                    identificationDocumentCode: true,
                    legalOrganizationCode: true,
                    tributeCode: true,
                    municipalityCode: true,
                },
            },
            pointOfSale: { select: { id: true, name: true } },
        },
        orderBy: { einvoiceDeferredAt: "asc" },
        take: 500,
    });

    return orders.map((order) => ({
        _id: order.legacyMongoId || order.id,
        invoice_no: order.invoiceNo,
        order_date: order.orderDate,
        order_status: order.orderStatus,
        total: Number(order.total),
        point_of_sale: order.pointOfSale ? { _id: order.pointOfSale.id, name: order.pointOfSale.name } : null,
        customer: order.customer
            ? {
                  _id: order.customer.legacyMongoId || order.customer.id,
                  name: order.customer.name,
                  identification: order.customer.identification,
                  is_final_consumer: order.customer.type === "final_consumer",
              }
            : null,
        missing_fiscal_fields: missingFiscalFields(order.customer),
        deferred_at: order.einvoiceDeferredAt,
        defer_reason: order.einvoiceDeferReason,
        // Only a completed sale can be issued - a still-pending one waits.
        can_issue_now: order.orderStatus === "completed",
    }));
};

export const countPendingEinvoices = ({ user }) =>
    prisma.order.count({
        where: { ...scopedWhere(user), einvoiceDeferredAt: { not: null }, electronicInvoice: null, orderStatus: { not: "cancelled" } },
    });

// Typical case: sold to "Consumidor final", then the buyer asks for the
// invoice in their own name. The accounting third party on the sale's and
// its payments' journal lines moves with it, so cartera/exógena never keep
// the old customer. Only while nothing has been issued or returned yet.
export const changeDeferredOrderCustomer = async ({ user, orderId, customerId }) => {
    const order = await prisma.order.findFirst({
        where: { OR: [{ id: orderId }, { legacyMongoId: orderId }], createdById: user.prismaId },
        include: {
            electronicInvoice: { select: { id: true } },
            orderDetails: { select: { returnedQuantity: true } },
            payments: { select: { id: true } },
        },
    });
    if (!order) throw new ApiError(404, "Order not found.");
    if (user.role !== "admin") assertPosAccess(user, order.pointOfSaleId);
    if (!order.einvoiceDeferredAt) throw new ApiError(400, "Solo se puede cambiar el cliente de una venta con la factura pendiente.", [], "", "einvoice_customer_change_not_deferred");
    if (order.electronicInvoice) throw new ApiError(409, "Esta venta ya tiene documento DIAN; el cliente ya no se puede cambiar.", [], "", "einvoice_customer_change_already_issued");
    if (order.orderDetails.some((d) => d.returnedQuantity > 0)) {
        throw new ApiError(409, "La venta tiene devoluciones; el cliente ya no se puede cambiar.", [], "", "einvoice_customer_change_has_returns");
    }

    const customer = await prisma.customer.findFirst({
        where: { OR: [{ id: customerId }, { legacyMongoId: customerId }], createdById: user.prismaId },
    });
    if (!customer) throw new ApiError(404, "Customer not found.");
    if (customer.pointOfSaleId && customer.pointOfSaleId !== order.pointOfSaleId) {
        throw new ApiError(400, "Ese cliente pertenece a otro punto de venta.", [], "", "einvoice_customer_change_other_pos");
    }
    if (customer.id === order.customerId) return { changed: false };

    const sourceIds = [order.id, ...order.payments.map((p) => p.id)];
    await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { customerId: customer.id, updatedById: user.actorId } });
        await tx.journalEntryLine.updateMany({
            where: {
                thirdPartyType: "customer",
                thirdPartyId: order.customerId,
                journalEntry: { sourceId: { in: sourceIds } },
            },
            data: {
                thirdPartyId: customer.id,
                thirdPartyName: customer.name,
                thirdPartyDocument: customer.identification || null,
            },
        });
    });
    emitPosEvent(user.prismaId, order.pointOfSaleId, "order", "updated");
    return { changed: true, missing_fiscal_fields: missingFiscalFields(customer) };
};
