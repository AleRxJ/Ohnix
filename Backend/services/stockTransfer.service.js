import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { claimLocationStockWithCost, creditLocationStockWithCost } from "./productLocationStock.service.js";
import { claimBatchesFEFO, creditBatch } from "./productBatch.service.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { postTransferDiscrepancyJournalEntry } from "./accountingPosting.service.js";

// Full request -> approve -> ship -> receive -> cancel lifecycle for moving
// stock between two of an account's locations (2026-08-21 multi-location
// inventory spec). Stock only actually moves at two transitions - see the
// StockTransfer model comment in schema.prisma - everything else here is
// bookkeeping. Every mutating function takes the already-loaded `transfer`
// row (not an id) so the controller does the fetch-and-authorize step once,
// the same "fetch, then compare, then act" shape used everywhere else in
// this codebase.

const VALID_TRANSITIONS = {
    requested: ["approved", "cancelled"],
    approved: ["in_transit", "cancelled"],
    in_transit: ["received", "cancelled"],
    received: [],
    cancelled: [],
};

const assertTransition = (transfer, toStatus) => {
    if (!VALID_TRANSITIONS[transfer.status]?.includes(toStatus)) {
        throw new ApiError(
            400,
            `No se puede pasar un traslado de "${transfer.status}" a "${toStatus}".`
        );
    }
};

const resolveLocations = async ({ accountId, productId, fromPointOfSaleId, toPointOfSaleId }) => {
    if (fromPointOfSaleId === toPointOfSaleId) {
        throw new ApiError(400, "El punto de origen y destino no pueden ser el mismo.");
    }
    const [product, fromPos, toPos] = await Promise.all([
        prisma.product.findFirst({ where: { id: productId, createdById: accountId }, select: { id: true, tracksBatches: true } }),
        prisma.pointOfSale.findFirst({ where: { id: fromPointOfSaleId, accountId, isActive: true }, select: { id: true } }),
        prisma.pointOfSale.findFirst({ where: { id: toPointOfSaleId, accountId, isActive: true }, select: { id: true } }),
    ]);
    if (!product) throw new ApiError(404, "Producto no encontrado.");
    if (!fromPos || !toPos) throw new ApiError(404, "Punto de venta no encontrado.");
    return product;
};

export const requestTransfer = async ({ accountId, actorId, productId, fromPointOfSaleId, toPointOfSaleId, quantity, notes }) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, "La cantidad debe ser un entero positivo.");
    }
    await resolveLocations({ accountId, productId, fromPointOfSaleId, toPointOfSaleId });

    const transfer = await prisma.stockTransfer.create({
        data: {
            accountId,
            productId,
            fromPointOfSaleId,
            toPointOfSaleId,
            quantitySent: quantity,
            notes: notes || null,
            requestedById: actorId,
            status: "requested",
        },
    });

    emitPosEvent(accountId, fromPointOfSaleId, "stockTransfer", "requested");
    emitPosEvent(accountId, toPointOfSaleId, "stockTransfer", "requested");
    return transfer;
};

export const approveTransfer = async ({ transfer, actorId }) => {
    assertTransition(transfer, "approved");

    // Claims the transition atomically against the status this caller
    // actually saw (not just the in-memory assertTransition check above) -
    // the same `updateMany({where:{id, status:<expected>}})` idiom
    // order.service.js/purchase.service.js already use for their status
    // transitions, so two concurrent actions on the same transfer (e.g. one
    // approving while another cancels) can't both silently win.
    const claim = await prisma.stockTransfer.updateMany({
        where: { id: transfer.id, status: transfer.status },
        data: { status: "approved", approvedById: actorId, approvedAt: new Date() },
    });
    if (claim.count === 0) {
        throw new ApiError(409, "Este traslado ya cambió de estado - actualiza para ver el estado actual.");
    }
    const updated = await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });

    emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "stockTransfer", "approved");
    emitPosEvent(transfer.accountId, transfer.toPointOfSaleId, "stockTransfer", "approved");
    return updated;
};

// The units leave the source location here - not on request, not on
// approval. Until this point nothing about the account's actual stock has
// changed; a cancelled request/approval never has to undo anything.
export const shipTransfer = async ({ transfer, actorId }) => {
    assertTransition(transfer, "in_transit");

    const updated = await prisma.$transaction(async (tx) => {
        const costing = await claimLocationStockWithCost(tx, {
            productId: transfer.productId,
            pointOfSaleId: transfer.fromPointOfSaleId,
            quantity: transfer.quantitySent,
        });
        if (costing === null) {
            throw new ApiError(
                422,
                `Stock insuficiente en el punto de origen para enviar ${transfer.quantitySent} unidades.`
            );
        }

        await recordStockMovement(tx, {
            productId: transfer.productId,
            accountId: transfer.accountId,
            pointOfSaleId: transfer.fromPointOfSaleId,
            delta: -transfer.quantitySent,
            balanceAfter: costing.balanceAfter,
            unitCostApplied: costing.unitCostApplied,
            valueDelta: costing.valueDelta,
            valueBalanceAfter: costing.valueBalanceAfter,
            sourceType: "transfer_out",
            sourceId: transfer.id,
            reason: transfer.notes,
            createdById: actorId,
        });

        // Frozen here, exactly like unitCostApplied above, so receiveTransfer
        // credits the destination with these SAME lots (not a fresh FEFO
        // guess against whatever the source looks like by then) and
        // cancelTransfer can put them straight back - see
        // StockTransfer.batchAllocations's schema comment.
        let batchAllocations;
        if (transfer.product?.tracksBatches) {
            const consumed = await claimBatchesFEFO(tx, {
                productId: transfer.productId,
                pointOfSaleId: transfer.fromPointOfSaleId,
                quantity: transfer.quantitySent,
            });
            if (consumed === null) {
                throw new ApiError(422, `Stock de lote insuficiente en el punto de origen para enviar ${transfer.quantitySent} unidades.`);
            }
            batchAllocations = consumed;
        }

        const claim = await tx.stockTransfer.updateMany({
            where: { id: transfer.id, status: transfer.status },
            data: {
                status: "in_transit",
                unitCostApplied: costing.unitCostApplied,
                ...(batchAllocations !== undefined && { batchAllocations }),
                sentById: actorId,
                sentAt: new Date(),
            },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este traslado ya cambió de estado - actualiza para ver el estado actual.");
        }
        return tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    });

    emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "stockTransfer", "in_transit");
    emitPosEvent(transfer.accountId, transfer.toPointOfSaleId, "stockTransfer", "in_transit");
    emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "product", "stock-changed");
    return updated;
};

// quantityReceived is stated by the receiving side, never assumed to equal
// quantitySent - see the model comment's discrepancy note. Only the
// received amount is credited to the destination; a shortfall is recorded
// (quantitySent - quantityReceived, derived from the two stored fields, see
// stockTransfer.controller.js's response mapping) but never silently
// materializes or vanishes stock elsewhere - it simply never arrived.
export const receiveTransfer = async ({ transfer, actorId, quantityReceived, notes }) => {
    assertTransition(transfer, "received");
    if (!Number.isInteger(quantityReceived) || quantityReceived < 0) {
        throw new ApiError(400, "La cantidad recibida debe ser un entero mayor o igual a cero.");
    }
    if (quantityReceived > transfer.quantitySent) {
        throw new ApiError(400, "La cantidad recibida no puede ser mayor a la cantidad enviada.");
    }

    const updated = await prisma.$transaction(async (tx) => {
        if (quantityReceived > 0) {
            const costing = await creditLocationStockWithCost(tx, {
                productId: transfer.productId,
                pointOfSaleId: transfer.toPointOfSaleId,
                quantity: quantityReceived,
                incomingUnitCost: transfer.unitCostApplied,
            });

            // Replays the exact lots ship-time claimed (see
            // StockTransfer.batchAllocations's schema comment) instead of
            // asking the receiver to name one - consumed front-to-back
            // (soonest-expiring first, same order they were claimed in)
            // up to whatever actually arrived, so a partial receipt still
            // credits the destination with real lot identities rather than
            // a synthetic one.
            if (transfer.product?.tracksBatches && Array.isArray(transfer.batchAllocations)) {
                let remaining = quantityReceived;
                for (const allocation of transfer.batchAllocations) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, Number(allocation.quantity));
                    if (take <= 0) continue;
                    await creditBatch(tx, {
                        productId: transfer.productId,
                        pointOfSaleId: transfer.toPointOfSaleId,
                        batchNumber: allocation.batchNumber,
                        expirationDate: allocation.expirationDate,
                        quantity: take,
                        createdById: actorId,
                    });
                    remaining -= take;
                }
            }

            await recordStockMovement(tx, {
                productId: transfer.productId,
                accountId: transfer.accountId,
                pointOfSaleId: transfer.toPointOfSaleId,
                delta: quantityReceived,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "transfer_in",
                sourceId: transfer.id,
                reason: notes || transfer.notes,
                createdById: actorId,
            });
        }

        const row = await tx.productLocationStock.findUnique({
            where: {
                productId_pointOfSaleId: { productId: transfer.productId, pointOfSaleId: transfer.toPointOfSaleId },
            },
            select: { stock: true, inventoryValue: true },
        });

        // The shortfall itself, as its own zero-delta ledger entry - the
        // transfer_out/transfer_in pair above already IS the complete
        // balance change (source -quantitySent, destination
        // +quantityReceived), so this doesn't move any stock. Without it,
        // "1 unit never arrived" only ever showed up in the StockTransfer's
        // own discrepancy field, invisible to anyone just scanning this
        // product's movement history at either location.
        if (quantityReceived < transfer.quantitySent) {
            await recordStockMovement(tx, {
                productId: transfer.productId,
                accountId: transfer.accountId,
                pointOfSaleId: transfer.toPointOfSaleId,
                delta: 0,
                balanceAfter: row?.stock ?? 0,
                unitCostApplied: transfer.unitCostApplied,
                valueDelta: 0,
                valueBalanceAfter: row?.inventoryValue ?? 0,
                sourceType: "transfer_discrepancy",
                sourceId: transfer.id,
                reason: `Diferencia en traslado: se enviaron ${transfer.quantitySent}, llegaron ${quantityReceived} (faltante: ${transfer.quantitySent - quantityReceived}).`,
                createdById: actorId,
            });
            await postTransferDiscrepancyJournalEntry(tx, {
                accountId: transfer.accountId,
                createdById: actorId,
                transferId: transfer.id,
                amount:
                    (transfer.quantitySent - quantityReceived) *
                    Number(transfer.unitCostApplied || 0),
            });
        }

        const claim = await tx.stockTransfer.updateMany({
            where: { id: transfer.id, status: transfer.status },
            data: {
                status: "received",
                quantityReceived,
                receivedById: actorId,
                receivedAt: new Date(),
                notes: notes ? `${transfer.notes ? `${transfer.notes}\n` : ""}${notes}` : transfer.notes,
            },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este traslado ya cambió de estado - actualiza para ver el estado actual.");
        }
        return tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    });

    emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "stockTransfer", "received");
    emitPosEvent(transfer.accountId, transfer.toPointOfSaleId, "stockTransfer", "received");
    emitPosEvent(transfer.accountId, transfer.toPointOfSaleId, "product", "stock-changed");
    return updated;
};

// Cancellable from any non-terminal state. If the units already left the
// source (in_transit), they're credited back there - a cancelled transfer
// must never just delete stock that a real ship already claimed.
export const cancelTransfer = async ({ transfer, actorId, reason }) => {
    if (!["requested", "approved", "in_transit"].includes(transfer.status)) {
        throw new ApiError(400, `No se puede cancelar un traslado en estado "${transfer.status}".`);
    }

    const updated = await prisma.$transaction(async (tx) => {
        if (transfer.status === "in_transit") {
            const costing = await creditLocationStockWithCost(tx, {
                productId: transfer.productId,
                pointOfSaleId: transfer.fromPointOfSaleId,
                quantity: transfer.quantitySent,
                incomingUnitCost: transfer.unitCostApplied,
            });

            // A cancelled in-transit transfer restores exactly the lots it
            // claimed at ship time (nothing else could have touched them -
            // they were never part of any location's available stock while
            // in transit), unlike a sale reversal's soonest-expiring
            // best-effort credit.
            if (transfer.product?.tracksBatches && Array.isArray(transfer.batchAllocations)) {
                for (const allocation of transfer.batchAllocations) {
                    await creditBatch(tx, {
                        productId: transfer.productId,
                        pointOfSaleId: transfer.fromPointOfSaleId,
                        batchNumber: allocation.batchNumber,
                        expirationDate: allocation.expirationDate,
                        quantity: allocation.quantity,
                        createdById: actorId,
                    });
                }
            }

            await recordStockMovement(tx, {
                productId: transfer.productId,
                accountId: transfer.accountId,
                pointOfSaleId: transfer.fromPointOfSaleId,
                delta: transfer.quantitySent,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "transfer_in",
                sourceId: transfer.id,
                reason: `Traslado cancelado: ${reason || "sin motivo especificado"}`,
                createdById: actorId,
            });
        }

        const claim = await tx.stockTransfer.updateMany({
            where: { id: transfer.id, status: transfer.status },
            data: {
                status: "cancelled",
                cancelledById: actorId,
                cancelledAt: new Date(),
                cancelReason: reason || null,
            },
        });
        if (claim.count === 0) {
            throw new ApiError(409, "Este traslado ya cambió de estado - actualiza para ver el estado actual.");
        }
        return tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    });

    emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "stockTransfer", "cancelled");
    emitPosEvent(transfer.accountId, transfer.toPointOfSaleId, "stockTransfer", "cancelled");
    if (transfer.status === "in_transit") {
        emitPosEvent(transfer.accountId, transfer.fromPointOfSaleId, "product", "stock-changed");
    }
    return updated;
};

// "Traslado rápido" - a move that already happened physically and doesn't
// need the request/approve/ship workflow. Still produces a full
// StockTransfer row (status jumps straight to received, every *At
// timestamp equal, quantityReceived = quantitySent) so it's exactly as
// traceable as a workflowed one - never a shortcut that skips the ledger.
// This is the one function that claims AND credits in the same
// transaction, since there's no in-transit period to model.
export const quickTransfer = async ({ accountId, actorId, productId, fromPointOfSaleId, toPointOfSaleId, quantity, notes }) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, "La cantidad debe ser un entero positivo.");
    }
    const product = await resolveLocations({ accountId, productId, fromPointOfSaleId, toPointOfSaleId });

    const transferId = await prisma.$transaction(async (tx) => {
        const sourceCosting = await claimLocationStockWithCost(tx, { productId, pointOfSaleId: fromPointOfSaleId, quantity });
        if (sourceCosting === null) {
            throw new ApiError(
                422,
                `Stock insuficiente en el punto de origen (solicitado: ${quantity}).`
            );
        }
        const destinationCosting = await creditLocationStockWithCost(tx, {
            productId,
            pointOfSaleId: toPointOfSaleId,
            quantity,
            incomingUnitCost: sourceCosting.unitCostApplied,
        });

        // Same-transaction claim-then-credit means the exact lots claimed
        // from the source can be credited straight to the destination
        // under their own identity, no snapshot needed (unlike the
        // workflowed ship/receive pair, which has to survive an in-transit
        // period between the two steps).
        let batchAllocations;
        if (product.tracksBatches) {
            const consumed = await claimBatchesFEFO(tx, { productId, pointOfSaleId: fromPointOfSaleId, quantity });
            if (consumed === null) {
                throw new ApiError(422, `Stock de lote insuficiente en el punto de origen (solicitado: ${quantity}).`);
            }
            for (const allocation of consumed) {
                await creditBatch(tx, {
                    productId,
                    pointOfSaleId: toPointOfSaleId,
                    batchNumber: allocation.batchNumber,
                    expirationDate: allocation.expirationDate,
                    quantity: allocation.quantity,
                    createdById: actorId,
                });
            }
            batchAllocations = consumed;
        }

        const now = new Date();
        const transfer = await tx.stockTransfer.create({
            data: {
                accountId,
                productId,
                fromPointOfSaleId,
                toPointOfSaleId,
                quantitySent: quantity,
                quantityReceived: quantity,
                unitCostApplied: sourceCosting.unitCostApplied,
                ...(batchAllocations !== undefined && { batchAllocations }),
                status: "received",
                isQuickTransfer: true,
                notes: notes || null,
                requestedById: actorId,
                requestedAt: now,
                approvedById: actorId,
                approvedAt: now,
                sentById: actorId,
                sentAt: now,
                receivedById: actorId,
                receivedAt: now,
            },
        });

        await recordStockMovement(tx, {
            productId,
            accountId,
            pointOfSaleId: fromPointOfSaleId,
            delta: -quantity,
            balanceAfter: sourceCosting.balanceAfter,
            unitCostApplied: sourceCosting.unitCostApplied,
            valueDelta: sourceCosting.valueDelta,
            valueBalanceAfter: sourceCosting.valueBalanceAfter,
            sourceType: "transfer_out",
            sourceId: transfer.id,
            reason: notes || null,
            createdById: actorId,
        });
        await recordStockMovement(tx, {
            productId,
            accountId,
            pointOfSaleId: toPointOfSaleId,
            delta: quantity,
            balanceAfter: destinationCosting.balanceAfter,
            unitCostApplied: destinationCosting.unitCostApplied,
            valueDelta: destinationCosting.valueDelta,
            valueBalanceAfter: destinationCosting.valueBalanceAfter,
            sourceType: "transfer_in",
            sourceId: transfer.id,
            reason: notes || null,
            createdById: actorId,
        });

        return transfer.id;
    });

    emitPosEvent(accountId, fromPointOfSaleId, "product", "stock-changed");
    emitPosEvent(accountId, toPointOfSaleId, "product", "stock-changed");
    emitPosEvent(accountId, fromPointOfSaleId, "stockTransfer", "received");
    emitPosEvent(accountId, toPointOfSaleId, "stockTransfer", "received");
    return prisma.stockTransfer.findUniqueOrThrow({ where: { id: transferId } });
};

// approvedById/sentById/receivedById/cancelledById are plain scalar columns,
// not Prisma relations (only requestedBy has one) - adding real relations
// for four rarely-read columns would mean four new FK constraints for what
// is otherwise a read-only "who did this" display. Batch-resolving them
// here instead, the same way a manual join would, keeps this out of the
// schema entirely.
const attachActorUsers = async (transfers) => {
    const idSet = new Set();
    for (const t of transfers) {
        if (t.approvedById) idSet.add(t.approvedById);
        if (t.sentById) idSet.add(t.sentById);
        if (t.receivedById) idSet.add(t.receivedById);
        if (t.cancelledById) idSet.add(t.cancelledById);
    }

    const byId = idSet.size
        ? new Map(
              (
                  await prisma.user.findMany({
                      where: { id: { in: [...idSet] } },
                      select: { id: true, username: true },
                  })
              ).map((u) => [u.id, u])
          )
        : new Map();

    return transfers.map((t) => ({
        ...t,
        approvedBy: t.approvedById ? byId.get(t.approvedById) || null : null,
        sentBy: t.sentById ? byId.get(t.sentById) || null : null,
        receivedBy: t.receivedById ? byId.get(t.receivedById) || null : null,
        cancelledBy: t.cancelledById ? byId.get(t.cancelledById) || null : null,
    }));
};

export const getTransferById = async (accountId, id) => {
    const transfer = await prisma.stockTransfer.findFirst({
        where: { id, accountId },
        include: { product: { select: { id: true, legacyMongoId: true, productName: true, productCode: true, tracksBatches: true } } },
    });
    if (!transfer) throw new ApiError(404, "Traslado no encontrado.");
    const [withActors] = await attachActorUsers([transfer]);
    return withActors;
};

// Restricted-scope actors only see transfers touching a location they can
// see - same "hasPosAccess on at least one end" rule the create/action
// endpoints enforce (pos.permissions.js), applied here as a query filter
// instead of a per-record check.
export const listTransfers = async ({ accountId, posScopeAll, posScopeIds, status, productId }) => {
    const transfers = await prisma.stockTransfer.findMany({
        where: {
            accountId,
            ...(status ? { status } : {}),
            ...(productId ? { productId } : {}),
            ...(posScopeAll
                ? {}
                : {
                      OR: [
                          { fromPointOfSaleId: { in: posScopeIds || [] } },
                          { toPointOfSaleId: { in: posScopeIds || [] } },
                      ],
                  }),
        },
        include: {
            product: { select: { id: true, legacyMongoId: true, productName: true, productCode: true } },
            fromPointOfSale: { select: { id: true, name: true } },
            toPointOfSale: { select: { id: true, name: true } },
            requestedBy: { select: { id: true, username: true } },
        },
        orderBy: { requestedAt: "desc" },
        take: 200,
    });
    return attachActorUsers(transfers);
};
