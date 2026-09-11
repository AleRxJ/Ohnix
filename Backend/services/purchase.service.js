import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { claimLocationStockWithCost, creditLocationStockWithCost } from "./productLocationStock.service.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";
import { buildAccountingThirdParty, postPurchaseJournalEntry, postPurchaseReturnJournalEntry } from "./accountingPosting.service.js";
import { issueSupportDocumentForPurchase } from "./purchaseSupportDocument.service.js";
import { triggerAcuseDeReciboForPurchase } from "./receiptAcknowledgment.service.js";
import { buildPurchaseRetentionSnapshots, calculateRetentionReturn } from "./withholdingConcept.service.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

// Fire-and-forget, same pattern as order.service.js's
// triggerElectronicInvoicingIfCompleted - failure here must never fail the
// purchase-completion request itself (stock/accounting already committed).
const triggerSupportDocumentIfCompleted = ({ purchaseId, userId, userRole, trigger }) => {
    issueSupportDocumentForPurchase({
        purchaseId,
        requesterUserId: userId,
        requesterRole: userRole,
        trigger,
    }).catch((error) => {
        console.warn("[support-document] async issuance skipped/failed", {
            purchaseId,
            trigger,
            message: error?.message || error,
        });
    });
};

// Same fire-and-forget pattern as triggerSupportDocumentIfCompleted above,
// for the opposite supplier precondition (issuesElectronicInvoice, not
// notObligatedToInvoice) - see receiptAcknowledgment.service.js. Internally
// no-ops (via its own 409 checks) for a purchase whose supplier doesn't
// need this, exactly like the support-document trigger does for its own
// precondition - so it's safe to fire unconditionally alongside it.
const triggerReceiptAcknowledgmentIfCompleted = ({ purchaseId, userId, userRole, trigger }) => {
    triggerAcuseDeReciboForPurchase({
        purchaseId,
        requesterUserId: userId,
        requesterRole: userRole,
        trigger,
    }).catch((error) => {
        console.warn("[receipt-acknowledgment] async acuse skipped/failed", {
            purchaseId,
            trigger,
            message: error?.message || error,
        });
    });
};

const findSupplierByAnyId = async (id) =>
    prisma.supplier.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: { id: true, createdById: true, pointOfSaleId: true },
    });

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            createdById: true,
            productName: true,
            productCode: true,
            stock: true,
            taxTreatment: true,
            taxRate: true,
        },
    });

// IVA descontable (input VAT credit, ET art. 485-490) - same shape as
// order.service.js#computeItemTax, mirrored here rather than imported since
// the two services don't otherwise share a dependency. A company that
// doesn't collect VAT on sales ("not_responsible") can't credit it on
// purchases either - the same companyVatResponsible gate applies both ways.
const computePurchaseItemTax = (product, quantity, unitcost, companyCollectsVat) => {
    const treatment = companyCollectsVat ? product.taxTreatment : "excluded";
    if (treatment !== "taxed") {
        return { treatment, rate: 0, amount: 0 };
    }
    const rate = Number(product.taxRate) || 0;
    const lineTotal = quantity * unitcost;
    return { treatment, rate, amount: Number(((lineTotal * rate) / 100).toFixed(2)) };
};

const findPurchaseByAnyId = async (id) =>
    prisma.purchase.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        select: {
            id: true,
            legacyMongoId: true,
            purchaseStatus: true,
            createdById: true,
            pointOfSaleId: true,
            supplier: { select: { id: true, name: true, identification: true } },
        },
    });

class PurchaseService {
    async createPurchase(purchaseData, userId, userRole, pointOfSaleId) {
        const { supplier_id, purchase_no, purchase_status, due_date, details, is_tutorial_data, source_quotation_id, withholding_concept_ids } = purchaseData;

        if (
            !supplier_id ||
            !purchase_no ||
            !Array.isArray(details) ||
            details.length === 0
        ) {
            throw new ApiError(400, "Invalid purchase data");
        }

        const supplier = await findSupplierByAnyId(supplier_id);
        if (!supplier) {
            throw new ApiError(404, "Supplier not found", [], "", "supplier_not_found");
        }

        if (userRole !== "admin" && supplier.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to use this supplier");
        }
        // See order.service.js#createOrder's matching check - suppliers are
        // scoped to the location they were created at too.
        if (supplier.pointOfSaleId !== pointOfSaleId) {
            throw new ApiError(403, "Este proveedor pertenece a otro punto de venta.");
        }

        const productIds = details.map((d) => d.product_id?.toString()).filter(Boolean);
        const uniqueProductIds = [...new Set(productIds)];
        if (uniqueProductIds.length !== productIds.length) {
            throw new ApiError(
                400,
                "Duplicate products in purchase details",
                [],
                "",
                "duplicate_purchase_products"
            );
        }

        const products = await Promise.all(uniqueProductIds.map((id) => findProductByAnyId(id)));
        if (products.some((p) => !p)) {
            throw new ApiError(400, "One or more products not found", [], "", "products_not_found");
        }

        for (const product of products) {
            if (userRole !== "admin" && product.createdById !== userId) {
                throw new ApiError(403, "You don't have permission to use one or more products");
            }
        }

        for (const d of details) {
            if (!d.quantity || Number(d.quantity) < 1) {
                throw new ApiError(400, "Quantity must be at least 1 for all items");
            }
            if (d.unitcost === undefined || Number(d.unitcost) < 0) {
                throw new ApiError(400, "Unit cost must be non-negative for all items");
            }
        }

        const existing = await prisma.purchase.findUnique({
            where: { purchaseNo: String(purchase_no).trim() },
            select: { id: true },
        });
        if (existing) {
            throw new ApiError(409, "Purchase number already exists", [], "", "purchase_number_already_exists");
        }

        const initialStatus = purchase_status || "pending";
        if (!["pending", "completed"].includes(initialStatus)) {
            throw new ApiError(400, `Invalid purchase status: ${initialStatus}`);
        }

        const shouldAddStock = initialStatus === "completed";
        const dueDate = due_date ? new Date(due_date) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) throw new ApiError(400, "Fecha de vencimiento inválida.");

        // Same lookup order.service.js#createOrder does for the sales side -
        // whether this purchase's IVA can be credited depends on the
        // company's VAT responsibility, not on anything about the supplier.
        const owner = await prisma.user.findUnique({
            where: { id: userId },
            select: { company: { select: { vatResponsible: true, isWithholdingAgent: true, withholdingAgentEffectiveFrom: true } } },
        });
        const companyCollectsVat = owner?.company?.vatResponsible !== "not_responsible";

        try {
            const purchase = await prisma.$transaction(async (tx) => {
                const createdPurchase = await tx.purchase.create({
                    data: {
                        supplierId: supplier.id,
                        pointOfSaleId,
                        purchaseNo: String(purchase_no).trim(),
                        purchaseStatus: initialStatus,
                        dueDate,
                        isTutorialData: is_tutorial_data === true,
                        createdById: userId,
                        updatedById: userId,
                    },
                });

                // Approving a quotation converts it into this exact Purchase,
                // inside the same transaction - the atomic claim (status must
                // still be "received") makes double-conversion impossible
                // even if two tabs try it at once: whichever request loses
                // the race gets 0 affected rows and the whole transaction
                // (including the Purchase row just created above) rolls
                // back, so no orphaned/duplicate Purchase is ever left behind.
                if (source_quotation_id) {
                    const linked = await tx.purchaseQuotation.updateMany({
                        where: { id: source_quotation_id, status: "received" },
                        data: { status: "approved", convertedPurchaseId: createdPurchase.id, updatedById: userId },
                    });
                    if (linked.count === 0) {
                        throw new ApiError(
                            409,
                            "This quotation was already converted or is no longer available.",
                            [],
                            "",
                            "quotation_already_converted"
                        );
                    }
                }

                let purchaseTotal = 0;
                let purchaseTaxAmount = 0;

                for (const detail of details) {
                    const mappedProduct = await findProductByAnyId(detail.product_id);
                    if (!mappedProduct) {
                        throw new ApiError(400, "One or more products not found", [], "", "products_not_found");
                    }

                    const itemTax = computePurchaseItemTax(
                        mappedProduct,
                        Number(detail.quantity),
                        Number(detail.unitcost),
                        companyCollectsVat
                    );

                    await tx.purchaseDetail.create({
                        data: {
                            purchaseId: createdPurchase.id,
                            productId: mappedProduct.id,
                            quantity: Number(detail.quantity),
                            unitcost: Number(detail.unitcost),
                            total: Number(detail.quantity) * Number(detail.unitcost),
                            taxTreatmentApplied: itemTax.treatment,
                            taxRateApplied: itemTax.rate,
                            taxAmount: itemTax.amount,
                        },
                    });

                    if (shouldAddStock) {
                        const costing = await creditLocationStockWithCost(tx, {
                            productId: mappedProduct.id,
                            pointOfSaleId,
                            quantity: Number(detail.quantity),
                            incomingUnitCost: Number(detail.unitcost),
                        });

                        await recordStockMovement(tx, {
                            productId: mappedProduct.id,
                            accountId: mappedProduct.createdById,
                            pointOfSaleId,
                            delta: Number(detail.quantity),
                            balanceAfter: costing.balanceAfter,
                            unitCostApplied: costing.unitCostApplied,
                            valueDelta: costing.valueDelta,
                            valueBalanceAfter: costing.valueBalanceAfter,
                            sourceType: "purchase",
                            sourceId: createdPurchase.id,
                            createdById: userId,
                        });
                    }

                    purchaseTotal += Number(detail.quantity) * Number(detail.unitcost);
                    purchaseTaxAmount += itemTax.amount;
                }

                const retentionSnapshots = await buildPurchaseRetentionSnapshots(tx, {
                    accountId: userId,
                    conceptIds: withholding_concept_ids,
                    transactionDate: createdPurchase.purchaseDate,
                    totals: { subtotal: purchaseTotal, vat: purchaseTaxAmount },
                });
                const hasIncomeWithholding = retentionSnapshots.some((retention) => retention.taxType === "income" && Number(retention.withheldAmount) > 0);
                const incomeAgentEffective = owner?.company?.isWithholdingAgent === true &&
                    (!owner.company.withholdingAgentEffectiveFrom || owner.company.withholdingAgentEffectiveFrom <= createdPurchase.purchaseDate);
                if (hasIncomeWithholding && !incomeAgentEffective) {
                    throw new ApiError(400, "La empresa no figura como agente retenedor vigente para aplicar retención en la fuente a esta compra.");
                }
                if (retentionSnapshots.length > 0) {
                    await tx.purchaseRetention.createMany({
                        data: retentionSnapshots.map((snapshot) => ({ purchaseId: createdPurchase.id, ...snapshot })),
                    });
                }

                if (shouldAddStock) {
                    await postPurchaseJournalEntry(tx, {
                        accountId: userId,
                        createdById: userId,
                        purchase: createdPurchase,
                        totals: { total: purchaseTotal, taxAmount: purchaseTaxAmount },
                        retentions: retentionSnapshots,
                        thirdParty: buildAccountingThirdParty("supplier", supplier),
                    });
                }

                return createdPurchase;
            });

            emitPosEvent(userId, pointOfSaleId, "purchase", "created");
            if (shouldAddStock) emitPosEvent(userId, pointOfSaleId, "product", "stock-changed");

            return {
                _id: toExternalId(purchase),
                purchase_no: purchase.purchaseNo,
                purchase_date: purchase.purchaseDate,
                due_date: purchase.dueDate,
                purchase_status: purchase.purchaseStatus,
                supplier_id,
                created_by: userId,
                createdAt: purchase.createdAt,
                updatedAt: purchase.updatedAt,
            };
        } catch (err) {
            if (err.code === "P2002") {
                throw new ApiError(409, "Purchase number already exists", [], "", "purchase_number_already_exists");
            }
            throw err;
        }
    }

    async updatePurchaseStatus(purchaseId, newStatus, userId, userRole, actingUser) {
        const purchase = await findPurchaseByAnyId(purchaseId);

        if (!purchase) {
            throw new ApiError(404, "Purchase not found");
        }

        if (userRole !== "admin" && purchase.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to update this purchase");
        }
        if (actingUser) assertPosAccess(actingUser, purchase.pointOfSaleId);

        // "returned" is no longer a client-settable transition - it's only
        // ever reached as a side effect of processReturn() once every line
        // has nothing left pending. See that method for the return flow.
        const validTransitions = {
            pending: ["completed"],
            completed: [],
            returned: [],
        };

        if (!validTransitions[purchase.purchaseStatus]?.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition purchase from "${purchase.purchaseStatus}" to "${newStatus}"`,
                [],
                "",
                "invalid_purchase_status_transition"
            );
        }

        const updatedPurchase = await prisma.$transaction(async (tx) => {
            // Atomically claim this transition before touching any stock -
            // the purchaseStatus/validTransitions check above read from a
            // query executed before this transaction started, so by itself
            // it can't stop two concurrent "completed" requests for the same
            // purchase from both passing it and both adding stock. This
            // UPDATE ... WHERE forces Postgres to serialize concurrent
            // callers on this row - the loser's WHERE clause re-evaluates
            // against the already-committed new status once it can proceed,
            // matching 0 rows (same technique already used by
            // subscription.controller.js's closeApprovedRequestAndActivatePlan).
            const claim = await tx.purchase.updateMany({
                where: { id: purchase.id, purchaseStatus: purchase.purchaseStatus },
                data: { purchaseStatus: newStatus, updatedById: userId },
            });

            if (claim.count === 0) {
                throw new ApiError(
                    409,
                    "This purchase was already updated by another request. Please refresh and try again."
                );
            }

            if (newStatus === "completed") {
                const purchaseDetails = await tx.purchaseDetail.findMany({
                    where: { purchaseId: purchase.id },
                    select: {
                        productId: true,
                        quantity: true,
                        unitcost: true,
                        total: true,
                        taxAmount: true,
                        product: { select: { createdById: true } },
                    },
                });

                for (const detail of purchaseDetails) {
                    const costing = await creditLocationStockWithCost(tx, {
                        productId: detail.productId,
                        pointOfSaleId: purchase.pointOfSaleId,
                        quantity: detail.quantity,
                        incomingUnitCost: Number(detail.unitcost),
                    });

                    await recordStockMovement(tx, {
                        productId: detail.productId,
                        accountId: detail.product.createdById,
                        pointOfSaleId: purchase.pointOfSaleId,
                        delta: detail.quantity,
                        balanceAfter: costing.balanceAfter,
                        unitCostApplied: costing.unitCostApplied,
                        valueDelta: costing.valueDelta,
                        valueBalanceAfter: costing.valueBalanceAfter,
                        sourceType: "purchase",
                        sourceId: purchase.id,
                        createdById: userId,
                    });
                }

                const purchaseTotal = purchaseDetails.reduce((sum, d) => sum + Number(d.total), 0);
                const purchaseTaxAmount = purchaseDetails.reduce((sum, d) => sum + Number(d.taxAmount), 0);
                const updatedPurchaseRow = await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
                const retentions = await tx.purchaseRetention.findMany({ where: { purchaseId: purchase.id } });
                await postPurchaseJournalEntry(tx, {
                    accountId: purchase.createdById,
                    createdById: userId,
                    purchase: updatedPurchaseRow,
                    totals: { total: purchaseTotal, taxAmount: purchaseTaxAmount },
                    retentions,
                    thirdParty: buildAccountingThirdParty("supplier", purchase.supplier),
                });
                return updatedPurchaseRow;
            }

            // Status/updatedById were already written atomically by the
            // claim above - just read back the current row for the response.
            return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
        });

        emitPosEvent(purchase.createdById, purchase.pointOfSaleId, "purchase", "updated");
        if (newStatus === "completed") emitPosEvent(purchase.createdById, purchase.pointOfSaleId, "product", "stock-changed");

        if (newStatus === "completed" && !updatedPurchase.isTutorialData) {
            triggerSupportDocumentIfCompleted({
                purchaseId: updatedPurchase.id,
                userId,
                userRole,
                trigger: "purchase_status_completed",
            });
            triggerReceiptAcknowledgmentIfCompleted({
                purchaseId: updatedPurchase.id,
                userId,
                userRole,
                trigger: "purchase_status_completed",
            });
        }

        return {
            purchase: {
                _id: toExternalId(updatedPurchase),
                purchase_status: updatedPurchase.purchaseStatus,
                purchase_no: updatedPurchase.purchaseNo,
                purchase_date: updatedPurchase.purchaseDate,
                createdAt: updatedPurchase.createdAt,
                updatedAt: updatedPurchase.updatedAt,
            },
        };
    }

    // Explicit, per-line return: the caller picks which purchase details to
    // return and how much of each, instead of the system silently returning
    // "whatever is still in stock" for every line at once. Can be called more
    // than once per purchase while any line still has quantity - returnedQuantity
    // > 0 left. purchaseStatus only flips to "returned" once every line on the
    // purchase has nothing left pending - see the schema comment on
    // PurchaseDetail for why returnedQuantity/refundAmount are running totals.
    async processReturn(purchaseId, lines, userId, userRole, actingUser) {
        const purchase = await findPurchaseByAnyId(purchaseId);

        if (!purchase) {
            throw new ApiError(404, "Purchase not found");
        }

        if (userRole !== "admin" && purchase.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to return items from this purchase");
        }
        if (actingUser) assertPosAccess(actingUser, purchase.pointOfSaleId);

        if (purchase.purchaseStatus !== "completed") {
            throw new ApiError(
                400,
                purchase.purchaseStatus === "returned"
                    ? "This purchase has already been fully returned"
                    : "Only completed purchases can be returned",
                [],
                "",
                "purchase_not_returnable"
            );
        }

        if (!Array.isArray(lines) || lines.length === 0) {
            throw new ApiError(400, "At least one return line is required");
        }

        const detailIds = lines.map((l) => l.purchase_detail_id?.toString()).filter(Boolean);
        const uniqueDetailIds = [...new Set(detailIds)];
        if (detailIds.length !== lines.length || uniqueDetailIds.length !== detailIds.length) {
            throw new ApiError(400, "Duplicate or missing purchase detail id in return request");
        }

        for (const line of lines) {
            const quantity = Number(line.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new ApiError(400, "Quantity must be a positive integer for every return line");
            }
        }

        // Matched by id OR legacyMongoId, same "any id" pattern as
        // findProductByAnyId/findPurchaseByAnyId above - getReturnPreview
        // hands the client toExternalId(detail), which is the legacy id for
        // rows migrated from Mongo.
        const details = await prisma.purchaseDetail.findMany({
            where: {
                purchaseId: purchase.id,
                OR: [{ id: { in: uniqueDetailIds } }, { legacyMongoId: { in: uniqueDetailIds } }],
            },
            include: {
                product: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        productName: true,
                        stock: true,
                        createdById: true,
                    },
                },
            },
        });

        if (details.length !== uniqueDetailIds.length) {
            throw new ApiError(400, "One or more return lines do not belong to this purchase");
        }

        const detailById = new Map(details.map((d) => [toExternalId(d), d]));

        // A purchase return can only give back stock this location actually
        // still has (it may have already been sold or transferred out) -
        // detail.product.stock is the account-wide total, not what's
        // available at purchase.pointOfSaleId specifically.
        const locationRowsForReturn = await prisma.productLocationStock.findMany({
            where: {
                pointOfSaleId: purchase.pointOfSaleId,
                productId: { in: [...new Set(details.map((d) => d.product.id))] },
            },
            select: { productId: true, stock: true },
        });
        const locationStockForReturn = new Map(locationRowsForReturn.map((r) => [r.productId, r.stock]));

        const insufficientItems = [];
        for (const line of lines) {
            const detail = detailById.get(line.purchase_detail_id);
            const pending = detail.quantity - detail.returnedQuantity;
            const locationStock = locationStockForReturn.get(detail.product.id) ?? 0;
            const maxReturnable = Math.min(pending, locationStock);
            if (Number(line.quantity) > maxReturnable) {
                insufficientItems.push({
                    purchase_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    requested: Number(line.quantity),
                    available: Math.max(maxReturnable, 0),
                    reason: pending <= 0 ? "already_fully_returned" : "insufficient_stock",
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

        const { results, purchaseFullyReturned } = await prisma.$transaction(async (tx) => {
            const results = [];
            const journalLines = [];
            let returnedSubtotalNow = 0;
            let returnedVatNow = 0;
            const purchaseRetentions = await tx.purchaseRetention.findMany({ where: { purchaseId: purchase.id } });

            for (const line of lines) {
                const detail = detailById.get(line.purchase_detail_id);
                const quantity = Number(line.quantity);

                // Same atomic-claim idiom as adjustProductStock and the
                // "completed" branch above, against this location's stock
                // now instead of the product's account-wide total: the
                // stock read used for the insufficientItems check predates
                // this transaction, so it can't by itself stop a concurrent
                // sale/adjustment from taking the same location's stock in
                // between.
                const costing = await claimLocationStockWithCost(tx, {
                    productId: detail.product.id,
                    pointOfSaleId: purchase.pointOfSaleId,
                    quantity,
                });

                if (costing === null) {
                    throw new ApiError(
                        409,
                        `Not enough stock left to return "${detail.product.productName}". Please refresh and try again.`
                    );
                }

                await recordStockMovement(tx, {
                    productId: detail.product.id,
                    accountId: detail.product.createdById,
                    pointOfSaleId: purchase.pointOfSaleId,
                    delta: -quantity,
                    balanceAfter: costing.balanceAfter,
                    unitCostApplied: costing.unitCostApplied,
                    valueDelta: costing.valueDelta,
                    valueBalanceAfter: costing.valueBalanceAfter,
                    sourceType: "purchase_return",
                    sourceId: purchase.id,
                    createdById: userId,
                });

                const refundNow = quantity * Number(detail.unitcost);
                const taxRemaining = Math.max(Number(detail.taxAmount) - Number(detail.returnedTaxAmount), 0);
                const returnedTaxNow = detail.returnedQuantity + quantity === detail.quantity
                    ? Number(taxRemaining.toFixed(2))
                    : Math.min(Number(((refundNow * Number(detail.taxRateApplied)) / 100).toFixed(2)), Number(taxRemaining.toFixed(2)));

                // Same claim idiom as the product stock update just above:
                // the returnedQuantity read that fed the insufficientItems
                // check predates this transaction, so without this guard two
                // concurrent returns on the *same line* could each pass
                // validation and both increment it, pushing returnedQuantity
                // past quantity even though the product-stock claim alone
                // would still stop physical stock from going negative.
                const detailClaim = await tx.purchaseDetail.updateMany({
                    where: { id: detail.id, returnedQuantity: detail.returnedQuantity },
                    data: {
                        returnDate: new Date(),
                        returnedQuantity: { increment: quantity },
                        refundAmount: { increment: refundNow },
                        returnedTaxAmount: { increment: returnedTaxNow },
                    },
                });

                if (detailClaim.count === 0) {
                    throw new ApiError(
                        409,
                        `"${detail.product.productName}" was returned by another request. Please refresh and try again.`
                    );
                }

                const updatedDetail = await tx.purchaseDetail.findUniqueOrThrow({
                    where: { id: detail.id },
                    select: { returnedQuantity: true, refundAmount: true },
                });

                results.push({
                    purchase_detail_id: toExternalId(detail),
                    product_id: toExternalId(detail.product),
                    returned_now: quantity,
                    refund_now: refundNow,
                    returned_quantity: updatedDetail.returnedQuantity,
                    refund_amount: Number(updatedDetail.refundAmount),
                    pending_quantity: detail.quantity - updatedDetail.returnedQuantity,
                    fully_returned: updatedDetail.returnedQuantity === detail.quantity,
                });

                // Pushed only after the claim above succeeds - a mid-loop
                // throw rolls back the whole tx before anything gets posted.
                journalLines.push({
                    quantity,
                    unitcost: detail.unitcost,
                    taxRateApplied: detail.taxRateApplied,
                    inventoryCostApplied: -costing.valueDelta,
                });
                returnedSubtotalNow += refundNow;
                returnedVatNow += returnedTaxNow;
            }

            const returnBases = {
                subtotal: Number(returnedSubtotalNow.toFixed(2)),
                vat: Number(returnedVatNow.toFixed(2)),
                total: Number((returnedSubtotalNow + returnedVatNow).toFixed(2)),
            };
            const retentionReturns = [];
            for (const retention of purchaseRetentions) {
                const calculated = calculateRetentionReturn(retention, returnBases[retention.baseType]);
                if (calculated.baseNow <= 0) continue;
                const claim = await tx.purchaseRetention.updateMany({
                    where: {
                        id: retention.id,
                        returnedBaseAmount: retention.returnedBaseAmount,
                        returnedWithheldAmount: retention.returnedWithheldAmount,
                    },
                    data: {
                        returnedBaseAmount: { increment: calculated.baseNow },
                        returnedWithheldAmount: { increment: calculated.withheldNow },
                    },
                });
                if (claim.count === 0) throw new ApiError(409, "Las retenciones de esta compra fueron actualizadas por otra devolución. Actualiza e intenta de nuevo.");
                retentionReturns.push({ ...retention, ...calculated });
            }

            const allDetails = await tx.purchaseDetail.findMany({
                where: { purchaseId: purchase.id },
                select: { quantity: true, returnedQuantity: true },
            });
            const purchaseFullyReturned = allDetails.every(
                (d) => d.returnedQuantity === d.quantity
            );

            if (purchaseFullyReturned) {
                await tx.purchase.updateMany({
                    where: { id: purchase.id, purchaseStatus: "completed" },
                    data: { purchaseStatus: "returned", updatedById: userId },
                });
            }

            await postPurchaseReturnJournalEntry(tx, {
                accountId: purchase.createdById,
                createdById: userId,
                sourceId: purchase.id,
                entryDate: new Date(),
                description: "Devolución de compra",
                lines: journalLines,
                retentionReturns,
                thirdParty: buildAccountingThirdParty("supplier", purchase.supplier),
                pointOfSaleId: purchase.pointOfSaleId,
            });

            return { results, purchaseFullyReturned };
        });

        emitPosEvent(purchase.createdById, purchase.pointOfSaleId, "purchase", "updated");
        emitPosEvent(purchase.createdById, purchase.pointOfSaleId, "product", "stock-changed");

        return {
            purchase_id: toExternalId(purchase),
            purchase_status: purchaseFullyReturned ? "returned" : "completed",
            purchase_fully_returned: purchaseFullyReturned,
            total_refund_amount: results.reduce((sum, r) => sum + r.refund_now, 0),
            return_details: results,
        };
    }
}

export default new PurchaseService();
