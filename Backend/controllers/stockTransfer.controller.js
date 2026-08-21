import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";
import * as stockTransferService from "../services/stockTransfer.service.js";

const toExternalId = (entity) => entity?.legacyMongoId || entity?.id;

// Shared with product.controller.js's "Traslado rápido" endpoint (which
// creates a StockTransfer under the hood too, see
// stockTransfer.service.js#quickTransfer) so both return the exact same
// shape regardless of which route produced the transfer. Tolerant of
// either the raw Prisma row or one with product/location/requestedBy
// included, since not every service function that returns a transfer
// bothers re-fetching the relations.
export const mapStockTransfer = (t) => ({
    _id: t.id,
    product_id: t.product ? toExternalId(t.product) : t.productId,
    product_name: t.product?.productName,
    product_code: t.product?.productCode,
    from_point_of_sale: t.fromPointOfSale
        ? { _id: t.fromPointOfSale.id, name: t.fromPointOfSale.name }
        : { _id: t.fromPointOfSaleId },
    to_point_of_sale: t.toPointOfSale
        ? { _id: t.toPointOfSale.id, name: t.toPointOfSale.name }
        : { _id: t.toPointOfSaleId },
    quantity_sent: t.quantitySent,
    quantity_received: t.quantityReceived,
    discrepancy: t.quantityReceived != null ? t.quantitySent - t.quantityReceived : null,
    status: t.status,
    is_quick_transfer: t.isQuickTransfer,
    notes: t.notes,
    cancel_reason: t.cancelReason,
    requested_by: t.requestedBy ? { _id: t.requestedBy.id, username: t.requestedBy.username } : { _id: t.requestedById },
    requested_at: t.requestedAt,
    approved_at: t.approvedAt,
    sent_at: t.sentAt,
    received_at: t.receivedAt,
    cancelled_at: t.cancelledAt,
});

// Every action below follows the same three steps: load the transfer
// scoped to this account (404s it out of existence for anyone else's),
// verify the actor can see both locations it touches (403 otherwise - a
// transfer is never operable by someone who can only see one end of it,
// see pos.permissions.js), then delegate to the service. Kept inline
// rather than as route middleware since the "load" step is also just the
// service call every handler already needs.
const loadAndAuthorize = async (req) => {
    const transfer = await stockTransferService.getTransferById(req.user.prismaId, req.params.id);
    if (req.user.role !== "admin") {
        assertPosAccess(req.user, transfer.fromPointOfSaleId);
        assertPosAccess(req.user, transfer.toPointOfSaleId);
    }
    return transfer;
};

export const createTransferRequest = asyncHandler(async (req, res, next) => {
    const { product_id, from_point_of_sale_id, to_point_of_sale_id, quantity, notes } = req.body || {};
    if (req.user.role !== "admin") {
        assertPosAccess(req.user, from_point_of_sale_id);
        assertPosAccess(req.user, to_point_of_sale_id);
    }
    const transfer = await stockTransferService.requestTransfer({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        productId: product_id,
        fromPointOfSaleId: from_point_of_sale_id,
        toPointOfSaleId: to_point_of_sale_id,
        quantity: Number(quantity),
        notes: notes ? String(notes).trim() : null,
    });
    return res.status(201).json(new ApiResponse(201, mapStockTransfer(transfer), "Transfer requested successfully"));
});

export const createQuickTransfer = asyncHandler(async (req, res, next) => {
    const { product_id, from_point_of_sale_id, to_point_of_sale_id, quantity, notes } = req.body || {};
    if (req.user.role !== "admin") {
        assertPosAccess(req.user, from_point_of_sale_id);
        assertPosAccess(req.user, to_point_of_sale_id);
    }
    const transfer = await stockTransferService.quickTransfer({
        accountId: req.user.prismaId,
        actorId: req.user.actorId,
        productId: product_id,
        fromPointOfSaleId: from_point_of_sale_id,
        toPointOfSaleId: to_point_of_sale_id,
        quantity: Number(quantity),
        notes: notes ? String(notes).trim() : null,
    });
    return res.status(201).json(new ApiResponse(201, mapStockTransfer(transfer), "Stock transferred successfully"));
});

export const listTransfers = asyncHandler(async (req, res) => {
    const { status, product_id } = req.query;
    const transfers = await stockTransferService.listTransfers({
        accountId: req.user.prismaId,
        posScopeAll: req.user.role === "admin" ? true : req.user.posScopeAll,
        posScopeIds: req.user.posScopeIds,
        status: status || undefined,
        productId: product_id || undefined,
    });
    return res.status(200).json(new ApiResponse(200, transfers.map(mapStockTransfer), "Transfers fetched successfully"));
});

export const getTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadAndAuthorize(req);
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(transfer), "Transfer fetched successfully"));
});

export const approveTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadAndAuthorize(req);
    const updated = await stockTransferService.approveTransfer({ transfer, actorId: req.user.actorId });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer approved"));
});

export const shipTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadAndAuthorize(req);
    const updated = await stockTransferService.shipTransfer({ transfer, actorId: req.user.actorId });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer shipped"));
});

export const receiveTransfer = asyncHandler(async (req, res, next) => {
    const transfer = await loadAndAuthorize(req);
    const { quantity_received, notes } = req.body || {};
    if (quantity_received === undefined || quantity_received === null) {
        return next(new ApiError(400, "quantity_received es obligatorio"));
    }
    const updated = await stockTransferService.receiveTransfer({
        transfer,
        actorId: req.user.actorId,
        quantityReceived: Number(quantity_received),
        notes: notes ? String(notes).trim() : null,
    });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer received"));
});

export const cancelTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadAndAuthorize(req);
    const { reason } = req.body || {};
    const updated = await stockTransferService.cancelTransfer({
        transfer,
        actorId: req.user.actorId,
        reason: reason ? String(reason).trim() : null,
    });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer cancelled"));
});
