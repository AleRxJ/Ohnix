import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import purchaseQuotationService from "../services/purchaseQuotation.service.js";
import { prisma } from "../db/prisma.js";
import { resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";

const mapQuotation = (quotation) => ({
    _id: quotation.id,
    quotation_no: quotation.quotationNo,
    status: quotation.status,
    valid_until: quotation.validUntil,
    notes: quotation.notes,
    converted_purchase_id: quotation.convertedPurchaseId,
    supplier_id: quotation.supplier
        ? { _id: quotation.supplier.id, name: quotation.supplier.name, shopname: quotation.supplier.shopname }
        : quotation.supplierId,
    created_by: quotation.createdBy
        ? { _id: quotation.createdBy.id, username: quotation.createdBy.username }
        : null,
    updated_by: quotation.updatedBy
        ? { _id: quotation.updatedBy.id, username: quotation.updatedBy.username }
        : null,
    details: Array.isArray(quotation.details) ? quotation.details.map(mapQuotationDetail) : undefined,
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
});

const mapQuotationDetail = (detail) => ({
    _id: detail.id,
    product_id: detail.product
        ? { _id: detail.product.id, product_name: detail.product.productName, product_code: detail.product.productCode }
        : detail.productId,
    quantity: detail.quantity,
    unitcost: Number(detail.unitcost),
    total: detail.quantity * Number(detail.unitcost),
});

const QUOTATION_INCLUDE = {
    supplier: { select: { id: true, name: true, shopname: true } },
    createdBy: { select: { id: true, username: true } },
    updatedBy: { select: { id: true, username: true } },
    details: { include: { product: { select: { id: true, productName: true, productCode: true } } } },
};

const findQuotationForResponse = (id) => prisma.purchaseQuotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });

export const createQuotation = asyncHandler(async (req, res, next) => {
    try {
        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
        const created = await purchaseQuotationService.createQuotation(req.body, req.user.prismaId, req.user.role, pointOfSaleId);
        const full = await findQuotationForResponse(created.id);
        return res.status(201).json(new ApiResponse(201, mapQuotation(full), "Quotation created successfully"));
    } catch (err) {
        return next(err);
    }
});

export const getAllQuotations = asyncHandler(async (req, res, next) => {
    try {
        const where =
            req.user.role === "admin"
                ? {}
                : {
                      createdById: req.user.prismaId,
                      ...(req.user.posScopeAll ? {} : { pointOfSaleId: { in: req.user.posScopeIds || [] } }),
                  };

        const quotations = await prisma.purchaseQuotation.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: QUOTATION_INCLUDE,
        });

        return res.status(200).json(new ApiResponse(200, quotations.map(mapQuotation), "Quotations fetched successfully"));
    } catch (err) {
        console.error(err);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export const getQuotationDetails = asyncHandler(async (req, res, next) => {
    try {
        const full = await findQuotationForResponse(req.params.id);
        if (!full) return next(new ApiError(404, "Quotation not found"));
        if (req.user.role !== "admin" && full.createdById !== req.user.prismaId) {
            return next(new ApiError(403, "You don't have permission to view this quotation"));
        }
        return res.status(200).json(new ApiResponse(200, mapQuotation(full), "Quotation fetched successfully"));
    } catch (err) {
        return next(err);
    }
});

export const updateQuotation = asyncHandler(async (req, res, next) => {
    try {
        const updated = await purchaseQuotationService.updateQuotation(req.params.id, req.body, req.user.prismaId, req.user.role, req.user);
        const full = await findQuotationForResponse(updated.id);
        return res.status(200).json(new ApiResponse(200, mapQuotation(full), "Quotation updated successfully"));
    } catch (err) {
        return next(err);
    }
});

export const markQuotationReceived = asyncHandler(async (req, res, next) => {
    try {
        const updated = await purchaseQuotationService.markReceived(req.params.id, req.user.prismaId, req.user.role, req.user);
        const full = await findQuotationForResponse(updated.id);
        return res.status(200).json(new ApiResponse(200, mapQuotation(full), "Quotation marked as received"));
    } catch (err) {
        return next(err);
    }
});

export const rejectQuotation = asyncHandler(async (req, res, next) => {
    try {
        const updated = await purchaseQuotationService.rejectQuotation(req.params.id, req.user.prismaId, req.user.role, req.user);
        const full = await findQuotationForResponse(updated.id);
        return res.status(200).json(new ApiResponse(200, mapQuotation(full), "Quotation rejected"));
    } catch (err) {
        return next(err);
    }
});
