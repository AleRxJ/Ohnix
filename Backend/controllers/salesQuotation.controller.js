import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import salesQuotationService from "../services/salesQuotation.service.js";
import { resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import orderService from "../services/order.service.js";

const INCLUDE = {
    customer: { select: { id: true, name: true, email: true, phone: true } },
    pointOfSale: { select: { name: true, account: { select: { username: true, company: { select: { name: true, legalName: true, contactEmail: true, phone: true } } } } } },
    details: { include: { product: { select: { id: true, productName: true, productCode: true } } } },
    createdBy: { select: { id: true, username: true } },
};

const mapQuotation = (quotation) => ({
    _id: quotation.id,
    quotation_no: quotation.quotationNo,
    public_token: quotation.publicToken,
    customer: quotation.customer,
    point_of_sale: quotation.pointOfSale,
    issuer: quotation.createdBy,
    pointOfSaleId: quotation.pointOfSaleId,
    status: quotation.status,
    issued_at: quotation.issuedAt,
    valid_until: quotation.validUntil,
    notes: quotation.notes,
    subtotal: Number(quotation.subtotal),
    discount_mode: quotation.discountType,
    discount_rate: Number(quotation.discountRate),
    discount: Number(quotation.discount),
    tax: Number(quotation.tax),
    total: Number(quotation.total),
    created_by: quotation.createdBy,
    details: quotation.details?.map((detail) => ({
        _id: detail.id,
        product_id: detail.product ? { _id: detail.product.id, product_name: detail.product.productName, product_code: detail.product.productCode } : detail.productId,
        quantity: detail.quantity,
        unit_price: Number(detail.unitPrice),
        discount: Number(detail.discount),
        discount_rate: Number(detail.discountRate),
        tax_rate: Number(detail.taxRate),
        tax_amount: Number(detail.taxAmount),
        line_total: Number(detail.lineTotal),
    })),
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
});

export const createSalesQuotation = asyncHandler(async (req, res, next) => {
    try {
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
        const quotation = await salesQuotationService.createQuotation(req.body, req.user.prismaId, req.user.role, pointOfSaleId, req.user);
        const full = await prisma.salesQuotation.findUnique({ where: { id: quotation.id }, include: INCLUDE });
        return res.status(201).json(new ApiResponse(201, mapQuotation(full), "Sales quotation created successfully"));
    } catch (error) {
        return next(error);
    }
});

export const getSalesQuotations = asyncHandler(async (req, res, next) => {
    try {
        const where = req.user.role === "admin"
            ? {}
            : { createdById: req.user.prismaId, ...(req.user.posScopeAll ? {} : { pointOfSaleId: { in: req.user.posScopeIds || [] } }) };
        const quotations = await prisma.salesQuotation.findMany({ where, orderBy: { createdAt: "desc" }, include: INCLUDE });
        return res.status(200).json(new ApiResponse(200, quotations.map(mapQuotation), "Sales quotations fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export const sendSalesQuotation = asyncHandler(async (req, res, next) => {
    try {
        const quotation = await salesQuotationService.sendQuotation(req.params.id, req.user.prismaId, req.user.role, req.user);
        return res.status(200).json(new ApiResponse(200, { _id: quotation.id, status: quotation.status }, "Sales quotation sent successfully"));
    } catch (error) {
        return next(error);
    }
});

export const getPublicSalesQuotation = asyncHandler(async (req, res, next) => {
    try {
        const quotation = await salesQuotationService.getPublicQuotation(req.params.token);
        return res.status(200).json(new ApiResponse(200, mapQuotation(quotation), "Sales quotation fetched successfully"));
    } catch (error) {
        return next(error);
    }
});

export const respondToPublicSalesQuotation = asyncHandler(async (req, res, next) => {
    try {
        const quotation = await salesQuotationService.respondToPublicQuotation(req.params.token, req.body?.status);
        return res.status(200).json(new ApiResponse(200, { status: quotation.status }, "Sales quotation response saved successfully"));
    } catch (error) {
        return next(error);
    }
});

export const convertSalesQuotation = asyncHandler(async (req, res, next) => {
    try {
        const quotation = await prisma.salesQuotation.findUnique({ where: { id: req.params.id }, include: { details: true } });
        if (!quotation) return next(new ApiError(404, "Sales quotation not found"));
        if (req.user.role !== "admin" && quotation.createdById !== req.user.prismaId) return next(new ApiError(403, "You do not have permission to convert this quotation"));
        if (quotation.status !== "accepted") return next(new ApiError(409, "Only an accepted quotation can become an order"));
        // The convert button sends no body - the order is sold where the quotation was made.
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req, { fallbackId: quotation.pointOfSaleId });
        const order = await orderService.createOrder({
            customer_id: quotation.customerId,
            order_status: "pending",
            source_sales_quotation_id: quotation.id,
            orderItems: quotation.details.map((detail) => ({ product_id: detail.productId, quantity: detail.quantity, unitcost: Number(detail.unitPrice) })),
        }, req.user.prismaId, req.user.role, pointOfSaleId);
        return res.status(201).json(new ApiResponse(201, order, "Sales quotation converted successfully"));
    } catch (error) {
        return next(error);
    }
});
