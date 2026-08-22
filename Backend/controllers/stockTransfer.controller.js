import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { hasPosAccess } from "../middleware/pos.permissions.js";
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

// Authorization is asymmetric by action, not a blanket "both ends" check -
// see the 2026-08-21 conversation on why. A transfer has two sides with
// genuinely different concerns: whoever has the destination in scope can
// ask for stock without ever seeing what the source actually has (they
// state a desired quantity, nothing more); whoever has the source in scope
// is the one who can confirm availability and release it. Requiring both
// for every action would make a single-location member unable to ever
// request restocking from a location they don't manage - a real workflow,
// not an edge case.
const loadTransfer = async (req) => stockTransferService.getTransferById(req.user.prismaId, req.params.id);

const assertDestinationAccess = (user, pointOfSaleId) => {
    if (user.role === "admin") return;
    if (!hasPosAccess(user, pointOfSaleId)) {
        throw new ApiError(403, "No tienes acceso al punto de venta de destino.");
    }
};

const assertSourceAccess = (user, pointOfSaleId) => {
    if (user.role === "admin") return;
    if (!hasPosAccess(user, pointOfSaleId)) {
        throw new ApiError(403, "No tienes acceso al punto de venta de origen.");
    }
};

// Reading and cancelling only require visibility into *a* side of the
// transfer, not both - same "at least one end in scope" rule
// listTransfers already applies as a query filter.
const assertEitherEndAccess = (user, transfer) => {
    if (user.role === "admin") return;
    if (!hasPosAccess(user, transfer.fromPointOfSaleId) && !hasPosAccess(user, transfer.toPointOfSaleId)) {
        throw new ApiError(403, "No tienes acceso a ninguno de los puntos de venta de este traslado.");
    }
};

// Requesting only needs the destination - the requester is asking "send me
// N units", never claiming to know what the source currently has. Approving
// and shipping are where availability actually gets checked (against
// ProductLocationStock), so those require the source instead - see
// approveTransfer/shipTransfer below.
export const createTransferRequest = asyncHandler(async (req, res, next) => {
    const { product_id, from_point_of_sale_id, to_point_of_sale_id, quantity, notes } = req.body || {};
    assertDestinationAccess(req.user, to_point_of_sale_id);
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

// Quick transfer stays symmetric (both ends required) - unlike the
// workflowed request above, this claims AND credits stock in the same
// atomic step with no separate approval, so the actor doing it is the one
// asserting "this already physically happened", which only makes sense for
// someone who could actually observe both sides of the move.
export const createQuickTransfer = asyncHandler(async (req, res, next) => {
    const { product_id, from_point_of_sale_id, to_point_of_sale_id, quantity, notes } = req.body || {};
    if (req.user.role !== "admin") {
        assertSourceAccess(req.user, from_point_of_sale_id);
        assertDestinationAccess(req.user, to_point_of_sale_id);
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
    const transfer = await loadTransfer(req);
    assertEitherEndAccess(req.user, transfer);
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(transfer), "Transfer fetched successfully"));
});

// Approving is the source side deciding whether to honor the request -
// requires seeing the source, not the destination.
export const approveTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadTransfer(req);
    assertSourceAccess(req.user, transfer.fromPointOfSaleId);
    const updated = await stockTransferService.approveTransfer({ transfer, actorId: req.user.actorId });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer approved"));
});

// Shipping is where stock actually leaves the source (claimLocationStock) -
// same reasoning as approve, requires the source.
export const shipTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadTransfer(req);
    assertSourceAccess(req.user, transfer.fromPointOfSaleId);
    const updated = await stockTransferService.shipTransfer({ transfer, actorId: req.user.actorId });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer shipped"));
});

// Receiving is the destination side confirming what arrived - requires the
// destination, not the source.
export const receiveTransfer = asyncHandler(async (req, res, next) => {
    const transfer = await loadTransfer(req);
    assertDestinationAccess(req.user, transfer.toPointOfSaleId);
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

// Either side can call off a transfer that hasn't completed yet - the
// requester deciding they no longer need it, or the source side declining
// to honor it. See stockTransfer.service.js#cancelTransfer for the
// stock-return-to-source logic when cancelling an in-transit one.
export const cancelTransfer = asyncHandler(async (req, res) => {
    const transfer = await loadTransfer(req);
    assertEitherEndAccess(req.user, transfer);
    const { reason } = req.body || {};
    const updated = await stockTransferService.cancelTransfer({
        transfer,
        actorId: req.user.actorId,
        reason: reason ? String(reason).trim() : null,
    });
    return res.status(200).json(new ApiResponse(200, mapStockTransfer(updated), "Transfer cancelled"));
});
