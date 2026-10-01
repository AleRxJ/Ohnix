import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import transporter, { isMailConfigured } from "../utils/nodemailer.js";
import { buildEmail, companyBrand, emailLinks } from "../utils/emailTemplate.js";
import crypto from "node:crypto";
import { getCapabilities } from "../middleware/team.permissions.js";
import { assertSalePricesAllowed } from "../utils/salePriceControl.js";

const findCustomerByAnyId = (id) =>
    prisma.customer.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true, pointOfSaleId: true },
    });

const findProductByAnyId = (id) =>
    prisma.product.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true, productName: true, sellingPrice: true, taxRate: true, taxTreatment: true },
    });

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const buildDetails = async (details, userId, userRole, companyVatResponsible) => {
    if (!Array.isArray(details) || details.length === 0) {
        throw new ApiError(400, "A sales quotation needs at least one product");
    }

    const productIds = details.map((detail) => String(detail.product_id || "")).filter(Boolean);
    if (new Set(productIds).size !== productIds.length) {
        throw new ApiError(400, "A product cannot be repeated in the quotation");
    }

    const products = await Promise.all(productIds.map(findProductByAnyId));
    if (products.some((product) => !product)) {
        throw new ApiError(400, "One or more products were not found", [], "", "products_not_found");
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const mapped = details.map((detail, index) => {
        const product = productById.get(productIds[index]);
        if (userRole !== "admin" && product.createdById !== userId) {
            throw new ApiError(403, "You do not have permission to use one or more products");
        }

        const quantity = Number(detail.quantity);
        const unitPrice = Number(detail.unit_price ?? product.sellingPrice);
        const discountRate = Number(detail.discount_rate || 0);
        const taxRate = companyVatResponsible !== "not_responsible" && product.taxTreatment === "taxed" ? Number(product.taxRate || 0) : 0;
        if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discountRate) || discountRate < 0 || discountRate > 100) {
            throw new ApiError(400, "Quantity, price, and discount must be valid non-negative values");
        }

        const discount = roundMoney(quantity * unitPrice * discountRate / 100);
        const lineBase = Math.max(0, quantity * unitPrice - discount);
        const taxAmount = roundMoney(lineBase * taxRate / 100);
        return {
            productId: product.id,
            quantity,
            unitPrice: roundMoney(unitPrice),
            discountRate: roundMoney(discountRate),
            discount: roundMoney(discount),
            taxRate: roundMoney(taxRate),
            taxAmount,
            lineTotal: roundMoney(lineBase + taxAmount),
            lineBase,
            // For the sale-price floor only - stripped before persisting.
            listPrice: Number(product.sellingPrice),
            productName: product.productName,
        };
    });

    return {
        details: mapped,
        subtotal: roundMoney(mapped.reduce((sum, detail) => sum + detail.lineBase, 0)),
        tax: roundMoney(mapped.reduce((sum, detail) => sum + detail.taxAmount, 0)),
    };
};

class SalesQuotationService {
    // actingUser: enforces the sale-price floor (salePriceControl.js) for a
    // team member without salesPriceOverride.
    async createQuotation(data, userId, userRole, pointOfSaleId, actingUser = null) {
        const { customer_id, quotation_no, valid_until, notes, discount_mode = "percentage", discount_rate = 0, discount_value = 0, details } = data;
        if (!customer_id || !quotation_no) throw new ApiError(400, "Customer and quotation number are required");

        const customer = await findCustomerByAnyId(customer_id);
        if (!customer) throw new ApiError(404, "Customer not found", [], "", "customer_not_found");
        if (userRole !== "admin" && customer.createdById !== userId) {
            throw new ApiError(403, "You do not have permission to use this customer");
        }
        if (customer.pointOfSaleId !== pointOfSaleId) {
            throw new ApiError(403, "This customer belongs to another point of sale");
        }

        if (!["percentage", "fixed"].includes(discount_mode)) throw new ApiError(400, "Invalid discount type");
        const headerDiscountRate = Number(discount_rate || 0);
        const requestedDiscountValue = Number(discount_value || 0);
        if (discount_mode === "percentage" && (!Number.isFinite(headerDiscountRate) || headerDiscountRate < 0 || headerDiscountRate > 100)) throw new ApiError(400, "Discount percentage must be between 0 and 100");
        if (discount_mode === "fixed" && (!Number.isFinite(requestedDiscountValue) || requestedDiscountValue < 0)) throw new ApiError(400, "Fixed discount must be valid");
        const owner = await prisma.user.findUnique({ where: { id: userId }, select: { company: { select: { vatResponsible: true } } } });
        const calculated = await buildDetails(details, userId, userRole, owner?.company?.vatResponsible);
        const headerDiscount = discount_mode === "fixed" ? roundMoney(Math.min(requestedDiscountValue, calculated.subtotal)) : roundMoney(calculated.subtotal * headerDiscountRate / 100);
        const subtotalAfterDiscount = Math.max(0, calculated.subtotal - headerDiscount);
        if (actingUser) {
            // Header discount spread proportionally over every line, so each
            // line's effective price reflects everything the customer gets.
            const headerFactor = calculated.subtotal > 0 ? subtotalAfterDiscount / calculated.subtotal : 1;
            assertSalePricesAllowed(
                calculated.details.map((detail) => ({
                    listPrice: detail.listPrice,
                    effectivePrice: (detail.lineBase / detail.quantity) * headerFactor,
                    label: detail.productName,
                })),
                await getCapabilities(actingUser)
            );
        }
        const total = roundMoney(subtotalAfterDiscount + calculated.tax);
        const quotationNo = String(quotation_no).trim();
        const existing = await prisma.salesQuotation.findUnique({ where: { quotationNo }, select: { id: true } });
        if (existing) throw new ApiError(409, "Quotation number already exists", [], "", "quotation_number_already_exists");

        try {
            return await prisma.$transaction(async (tx) => {
                const quotation = await tx.salesQuotation.create({
                    data: {
                        quotationNo,
                        publicToken: crypto.randomBytes(32).toString("hex"),
                        customerId: customer.id,
                        pointOfSaleId,
                        validUntil: valid_until ? new Date(valid_until) : null,
                        notes: notes?.trim() || null,
                        subtotal: calculated.subtotal,
                        discountType: discount_mode,
                        discountRate: discount_mode === "percentage" ? roundMoney(headerDiscountRate) : 0,
                        discount: roundMoney(headerDiscount),
                        tax: calculated.tax,
                        total,
                        createdById: userId,
                        updatedById: userId,
                        details: { create: calculated.details.map(({ lineBase, listPrice, productName, ...detail }) => detail) },
                    },
                    include: { details: true },
                });
                return quotation;
            });
        } catch (error) {
            if (error.code === "P2002") throw new ApiError(409, "Quotation number already exists", [], "", "quotation_number_already_exists");
            throw error;
        }
    }

    async sendQuotation(quotationId, userId, userRole, actingUser) {
        if (!isMailConfigured()) throw new ApiError(503, "Email delivery is not configured");
        const quotation = await prisma.salesQuotation.findUnique({
            where: { id: quotationId },
            include: {
                customer: { select: { id: true, name: true, email: true } },
                pointOfSale: { select: { account: { select: { company: { select: { name: true, legalName: true, contactEmail: true, phone: true, logoUrl: true, pdfAccentColor: true } } } } } },
                details: { include: { product: { select: { productName: true } } } },
            },
        });
        if (!quotation) throw new ApiError(404, "Sales quotation not found");
        if (userRole !== "admin" && quotation.createdById !== userId) throw new ApiError(403, "You do not have permission to send this quotation");
        if (actingUser?.posScopeAll === false && !actingUser.posScopeIds?.includes(quotation.pointOfSaleId)) throw new ApiError(403, "You do not have access to this point of sale");
        if (!quotation.customer?.email) throw new ApiError(400, "The customer has no email address");
        if (!["draft", "sent"].includes(quotation.status)) throw new ApiError(400, "Only draft or sent quotations can be sent");

        // The quote is issued by the tenant company, not by Ohnix - the
        // customer-facing subject/body/reply-to must name the actual issuer.
        // Brevo's sender identity stays "Ohnix" regardless (see
        // nodemailer.js's hardcoded SENDER_NAME - required for the verified
        // sending domain), so this is the only place the real issuer shows.
        const company = quotation.pointOfSale?.account?.company;
        const companyName = company?.legalName || company?.name || "Ohnix";
        const brand = companyBrand(company);
        const money = (value) => `$ ${Number(value).toLocaleString("es-CO")}`;
        const publicUrl = emailLinks.app(`/public/sales-quotations/${quotation.publicToken}`);
        // Spanish by default (Ohnix's market is Colombia and this reaches the
        // ISSUING company's own customer) and rendered in company-brand mode:
        // the company leads the header, Ohnix only signs the footer.
        await transporter.sendMail({
            from: `${companyName} <${process.env.SENDER_EMAIL}>`,
            to: quotation.customer.email,
            replyTo: company?.contactEmail || undefined,
            subject: `${companyName} - Cotización #${quotation.quotationNo}`,
            ...buildEmail({
                lang: "es",
                brand,
                category: "Cotización",
                preheader: `${companyName} te envió la cotización #${quotation.quotationNo} por ${money(quotation.total)}.`,
                title: `Cotización #${quotation.quotationNo}`,
                greeting: `Hola ${quotation.customer.name || ""},`,
                intro: `${companyName} te comparte la siguiente cotización. Puedes verla completa y aceptarla o rechazarla desde el botón.`,
                blocks: [
                    {
                        type: "table",
                        columns: [{ label: "Producto" }, { label: "Cant.", align: "center" }, { label: "Total", align: "right" }],
                        rows: [
                            ...quotation.details.map((detail) => [detail.product?.productName || "—", String(detail.quantity), money(detail.lineTotal)]),
                            [{ text: "Total", bold: true }, "", { text: money(quotation.total), bold: true }],
                        ],
                    },
                    {
                        type: "details",
                        rows: [["Válida hasta", quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }) : ""]],
                    },
                    ...(quotation.notes ? [{ type: "heading", text: "Notas" }, { type: "paragraph", text: quotation.notes }] : []),
                ],
                cta: { label: "Ver cotización", url: publicUrl },
                reason: `Recibes este correo porque ${companyName} te envió una cotización.`,
            }),
        });
        return prisma.salesQuotation.update({ where: { id: quotationId }, data: { status: "sent", updatedById: userId } });
    }

    async getPublicQuotation(token) {
        const quotation = await prisma.salesQuotation.findUnique({
            where: { publicToken: token },
            include: { customer: { select: { name: true, email: true, phone: true } }, pointOfSale: { select: { name: true, account: { select: { username: true, company: { select: { name: true, legalName: true, contactEmail: true, phone: true } } } } } }, createdBy: { select: { username: true } }, details: { include: { product: { select: { productName: true, productCode: true } } } } },
        });
        if (!quotation) throw new ApiError(404, "Sales quotation not found");
        if (quotation.status === "draft") throw new ApiError(404, "Sales quotation is not available");
        if (quotation.status === "sent") await prisma.salesQuotation.update({ where: { id: quotation.id }, data: { status: "viewed" } });
        return quotation;
    }

    async respondToPublicQuotation(token, nextStatus) {
        if (!["accepted", "rejected"].includes(nextStatus)) throw new ApiError(400, "Invalid quotation response");
        const quotation = await prisma.salesQuotation.findUnique({ where: { publicToken: token } });
        if (!quotation) throw new ApiError(404, "Sales quotation not found");
        if (!["sent", "viewed"].includes(quotation.status)) throw new ApiError(409, "This quotation can no longer receive a response");
        if (quotation.validUntil && new Date(quotation.validUntil) < new Date()) {
            await prisma.salesQuotation.update({ where: { id: quotation.id }, data: { status: "expired" } });
            throw new ApiError(409, "This quotation has expired");
        }
        return prisma.salesQuotation.update({ where: { id: quotation.id }, data: { status: nextStatus } });
    }
}

export default new SalesQuotationService();
