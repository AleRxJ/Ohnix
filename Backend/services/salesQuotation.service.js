import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import transporter, { isMailConfigured } from "../utils/nodemailer.js";
import crypto from "node:crypto";

const findCustomerByAnyId = (id) =>
    prisma.customer.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true, pointOfSaleId: true },
    });

const findProductByAnyId = (id) =>
    prisma.product.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true, sellingPrice: true, taxRate: true, taxTreatment: true },
    });

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));

const buildDetails = async (details, userId, userRole) => {
    if (!Array.isArray(details) || details.length === 0) {
        throw new ApiError(400, "A sales quotation needs at least one product");
    }

    const productIds = details.map((detail) => String(detail.product_id || "")).filter(Boolean);
    if (new Set(productIds).size !== productIds.length) {
        throw new ApiError(400, "A product cannot be repeated in the quotation");
    }

    const products = await Promise.all(productIds.map(findProductByAnyId));
    if (products.some((product) => !product)) {
        throw new ApiError(400, "One or more products were not found");
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
        const taxRate = product.taxTreatment === "taxed" ? Number(product.taxRate || 0) : 0;
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
        };
    });

    return {
        details: mapped,
        subtotal: roundMoney(mapped.reduce((sum, detail) => sum + detail.lineBase, 0)),
        tax: roundMoney(mapped.reduce((sum, detail) => sum + detail.taxAmount, 0)),
    };
};

class SalesQuotationService {
    async createQuotation(data, userId, userRole, pointOfSaleId) {
        const { customer_id, quotation_no, valid_until, notes, discount_mode = "percentage", discount_rate = 0, discount_value = 0, details } = data;
        if (!customer_id || !quotation_no) throw new ApiError(400, "Customer and quotation number are required");

        const customer = await findCustomerByAnyId(customer_id);
        if (!customer) throw new ApiError(404, "Customer not found");
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
        const calculated = await buildDetails(details, userId, userRole);
        const headerDiscount = discount_mode === "fixed" ? roundMoney(Math.min(requestedDiscountValue, calculated.subtotal)) : roundMoney(calculated.subtotal * headerDiscountRate / 100);
        const subtotalAfterDiscount = Math.max(0, calculated.subtotal - headerDiscount);
        const total = roundMoney(subtotalAfterDiscount + calculated.tax);
        const quotationNo = String(quotation_no).trim();
        const existing = await prisma.salesQuotation.findUnique({ where: { quotationNo }, select: { id: true } });
        if (existing) throw new ApiError(409, "Quotation number already exists");

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
                        details: { create: calculated.details.map(({ lineBase, ...detail }) => detail) },
                    },
                    include: { details: true },
                });
                return quotation;
            });
        } catch (error) {
            if (error.code === "P2002") throw new ApiError(409, "Quotation number already exists");
            throw error;
        }
    }

    async sendQuotation(quotationId, userId, userRole, actingUser) {
        if (!isMailConfigured()) throw new ApiError(503, "Email delivery is not configured");
        const quotation = await prisma.salesQuotation.findUnique({
            where: { id: quotationId },
            include: {
                customer: { select: { id: true, name: true, email: true } },
                details: { include: { product: { select: { productName: true } } } },
            },
        });
        if (!quotation) throw new ApiError(404, "Sales quotation not found");
        if (userRole !== "admin" && quotation.createdById !== userId) throw new ApiError(403, "You do not have permission to send this quotation");
        if (actingUser?.posScopeAll === false && !actingUser.posScopeIds?.includes(quotation.pointOfSaleId)) throw new ApiError(403, "You do not have access to this point of sale");
        if (!quotation.customer?.email) throw new ApiError(400, "The customer has no email address");
        if (!["draft", "sent"].includes(quotation.status)) throw new ApiError(400, "Only draft or sent quotations can be sent");

        const rows = quotation.details.map((detail) => `<tr><td style="padding:8px;border-bottom:1px solid #dce5e8;">${escapeHtml(detail.product.productName)}</td><td style="padding:8px;border-bottom:1px solid #dce5e8;text-align:center;">${escapeHtml(detail.quantity)}</td><td style="padding:8px;border-bottom:1px solid #dce5e8;text-align:right;">${escapeHtml(Number(detail.lineTotal).toLocaleString())}</td></tr>`).join("");
        const publicUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/public/sales-quotations/${quotation.publicToken}`;
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: quotation.customer.email,
            subject: `Ohnix - Sales quotation #${quotation.quotationNo}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px;color:#15232a;"><div style="color:#0b9997;font-weight:700;letter-spacing:.2em;">OHNIX</div><h2>Sales quotation #${escapeHtml(quotation.quotationNo)}</h2><p>Hello ${escapeHtml(quotation.customer.name)}, here is the quotation prepared for you.</p><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:8px;">Product</th><th style="padding:8px;">Qty</th><th style="text-align:right;padding:8px;">Total</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-size:20px;font-weight:700;border-top:2px solid #29d8d5;padding-top:12px;">Total: ${escapeHtml(Number(quotation.total).toLocaleString())}</p>${quotation.notes ? `<p style="border-top:1px solid #dce5e8;padding-top:12px;">${escapeHtml(quotation.notes)}</p>` : ""}<p style="margin-top:24px;text-align:center;"><a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#29d8d5;color:#021314;padding:12px 22px;border-radius:8px;font-weight:700;text-decoration:none;">View quotation</a></p></div>`,
        });
        return prisma.salesQuotation.update({ where: { id: quotationId }, data: { status: "sent", updatedById: userId } });
    }

    async getPublicQuotation(token) {
        const quotation = await prisma.salesQuotation.findUnique({
            where: { publicToken: token },
            include: { customer: { select: { name: true, email: true } }, details: { include: { product: { select: { productName: true, productCode: true } } } } },
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
