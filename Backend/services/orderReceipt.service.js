import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";

// Everything the Caja needs to print (or reprint) a sale's ticket, in one
// read - including for cashiers, who can't read /companies/me. The ticket is
// the printed representation of whatever DIAN document the sale has: the
// electronic invoice's number/CUFE/QR once accepted, otherwise it says the
// document is in process or pending ("Emitir después") and is only a sale
// receipt. Ohnix never prints something that looks like a DIAN document
// without one behind it.
export const getOrderReceipt = async ({ user, orderId }) => {
    const order = await prisma.order.findFirst({
        where: { OR: [{ id: orderId }, { legacyMongoId: orderId }], createdById: user.prismaId },
        include: {
            orderDetails: {
                include: {
                    product: { select: { productName: true, productCode: true } },
                    variant: { select: { optionsLabel: true } },
                },
                orderBy: { createdAt: "asc" },
            },
            customer: { select: { name: true, type: true, identification: true } },
            pointOfSale: { select: { name: true } },
            updatedBy: { select: { username: true } },
            payments: {
                select: { amount: true, method: true, reference: true, verificationStatus: true },
                orderBy: { paidAt: "asc" },
            },
            electronicInvoice: { select: { status: true, invoiceNumber: true, cufe: true, qrUrl: true, issuedAt: true } },
            createdBy: {
                select: {
                    company: {
                        select: {
                            name: true,
                            legalName: true,
                            taxIdentification: true,
                            taxIdentificationDv: true,
                            phone: true,
                            contactEmail: true,
                            logoUrl: true,
                            pdfFooterText: true,
                            vatResponsible: true,
                            electronicInvoicingEnabled: true,
                        },
                    },
                },
            },
        },
    });
    if (!order) throw new ApiError(404, "Order not found.");
    if (user.role !== "admin") assertPosAccess(user, order.pointOfSaleId);
    const tab = await prisma.tableTab.findUnique({ where: { orderId: order.id }, select: { table: { select: { name: true } } } });

    const company = order.createdBy?.company || {};
    const invoice = order.electronicInvoice;
    let document = { kind: "receipt" };
    if (invoice?.status === "accepted") {
        document = {
            kind: "electronic_invoice",
            number: invoice.invoiceNumber,
            cufe: invoice.cufe,
            qr_url: invoice.qrUrl || (invoice.cufe ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${invoice.cufe}` : null),
            issued_at: invoice.issuedAt,
        };
    } else if (invoice) {
        document = { kind: "in_process", status: invoice.status };
    } else if (order.einvoiceDeferredAt) {
        document = { kind: "deferred" };
    } else if (company.electronicInvoicingEnabled) {
        // Completed a moment ago - the async issuance hasn't claimed it yet.
        document = { kind: "in_process", status: "issuing" };
    }

    return {
        company: {
            name: company.legalName || company.name || "",
            trade_name: company.legalName && company.name && company.name !== company.legalName ? company.name : null,
            nit: company.taxIdentification ? `${company.taxIdentification}${company.taxIdentificationDv ? `-${company.taxIdentificationDv}` : ""}` : null,
            phone: company.phone,
            email: company.contactEmail,
            logo_url: company.logoUrl,
            footer: company.pdfFooterText,
            vat_responsible: company.vatResponsible === "responsible",
        },
        sale: {
            number: order.invoiceNo,
            date: order.orderDate,
            point_of_sale: order.pointOfSale?.name || null,
            table: tab?.table?.name || null,
            cashier: order.updatedBy?.username || null,
            status: order.orderStatus,
        },
        customer: {
            name: order.customer?.type === "final_consumer" ? null : order.customer?.name,
            is_final_consumer: order.customer?.type === "final_consumer",
            identification: order.customer?.identification || null,
        },
        lines: order.orderDetails.map((d) => ({
            name: d.variant?.optionsLabel ? `${d.product.productName} · ${d.variant.optionsLabel}` : d.product.productName,
            quantity: d.quantity,
            unit_price: Number(d.unitcost),
            total: Number(d.total),
            tax_rate: Number(d.taxRateApplied),
            tax_amount: Number(d.taxAmount),
        })),
        totals: {
            subtotal: Number(order.subTotal),
            tax: Number(order.gst),
            total: Number(order.total),
        },
        payments: order.payments.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            reference: p.reference,
            verification_status: p.verificationStatus,
        })),
        document,
    };
};
