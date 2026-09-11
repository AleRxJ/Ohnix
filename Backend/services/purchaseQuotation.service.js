import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPosAccess } from "../middleware/pos.permissions.js";

const findSupplierByAnyId = async (id) =>
    prisma.supplier.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true, pointOfSaleId: true },
    });

const findProductByAnyId = async (id) =>
    prisma.product.findFirst({
        where: { OR: [{ id }, { legacyMongoId: id }] },
        select: { id: true, createdById: true },
    });

const findQuotationById = async (id) =>
    prisma.purchaseQuotation.findUnique({
        where: { id },
        select: { id: true, status: true, createdById: true, pointOfSaleId: true },
    });

// Same shape as purchase.service.js's per-line validation (quantity >= 1,
// unitcost >= 0) and duplicate-product check - no tax/stock concerns here,
// those only apply once a quotation converts into a real Purchase.
const validateDetails = async (details, userRole, userId) => {
    if (!Array.isArray(details) || details.length === 0) {
        throw new ApiError(400, "Invalid quotation data");
    }

    const productIds = details.map((d) => d.product_id?.toString()).filter(Boolean);
    const uniqueProductIds = [...new Set(productIds)];
    if (uniqueProductIds.length !== productIds.length) {
        throw new ApiError(400, "Duplicate products in quotation details", [], "", "duplicate_quotation_products");
    }

    const products = await Promise.all(uniqueProductIds.map((id) => findProductByAnyId(id)));
    if (products.some((p) => !p)) {
        throw new ApiError(400, "One or more products not found");
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
};

class PurchaseQuotationService {
    async createQuotation(quotationData, userId, userRole, pointOfSaleId) {
        const { supplier_id, quotation_no, valid_until, notes, details } = quotationData;

        if (!supplier_id || !quotation_no) {
            throw new ApiError(400, "Invalid quotation data");
        }

        const supplier = await findSupplierByAnyId(supplier_id);
        if (!supplier) {
            throw new ApiError(404, "Supplier not found");
        }
        if (userRole !== "admin" && supplier.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to use this supplier");
        }
        // Same location scoping as purchase.service.js#createPurchase.
        if (supplier.pointOfSaleId !== pointOfSaleId) {
            throw new ApiError(403, "Este proveedor pertenece a otro punto de venta.");
        }

        await validateDetails(details, userRole, userId);

        const trimmedNo = String(quotation_no).trim();
        const existing = await prisma.purchaseQuotation.findUnique({ where: { quotationNo: trimmedNo }, select: { id: true } });
        if (existing) {
            throw new ApiError(409, "Quotation number already exists", [], "", "quotation_number_already_exists");
        }

        try {
            return await prisma.$transaction(async (tx) => {
                const created = await tx.purchaseQuotation.create({
                    data: {
                        supplierId: supplier.id,
                        pointOfSaleId,
                        quotationNo: trimmedNo,
                        validUntil: valid_until ? new Date(valid_until) : null,
                        notes: notes?.trim() || null,
                        createdById: userId,
                        updatedById: userId,
                    },
                });

                for (const detail of details) {
                    await tx.purchaseQuotationDetail.create({
                        data: {
                            quotationId: created.id,
                            productId: detail.product_id,
                            quantity: Number(detail.quantity),
                            unitcost: Number(detail.unitcost),
                        },
                    });
                }

                return created;
            });
        } catch (err) {
            if (err.code === "P2002") {
                throw new ApiError(409, "Quotation number already exists", [], "", "quotation_number_already_exists");
            }
            throw err;
        }
    }

    // Only while "draft" - once "received", the quoted prices are what gets
    // compared/decided on, so they stop being freely editable (mirrors why
    // PurchaseDetail's frozen tax fields never get rewritten after the fact).
    async updateQuotation(quotationId, quotationData, userId, userRole, actingUser) {
        const quotation = await findQuotationById(quotationId);
        if (!quotation) {
            throw new ApiError(404, "Quotation not found");
        }
        if (userRole !== "admin" && quotation.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to update this quotation");
        }
        if (actingUser) assertPosAccess(actingUser, quotation.pointOfSaleId);
        if (quotation.status !== "draft") {
            throw new ApiError(
                400,
                `Cannot edit a quotation in "${quotation.status}" status`,
                [],
                "",
                "quotation_not_editable"
            );
        }

        const { valid_until, notes, details } = quotationData;
        await validateDetails(details, userRole, userId);

        return prisma.$transaction(async (tx) => {
            await tx.purchaseQuotationDetail.deleteMany({ where: { quotationId } });
            for (const detail of details) {
                await tx.purchaseQuotationDetail.create({
                    data: {
                        quotationId,
                        productId: detail.product_id,
                        quantity: Number(detail.quantity),
                        unitcost: Number(detail.unitcost),
                    },
                });
            }
            return tx.purchaseQuotation.update({
                where: { id: quotationId },
                data: {
                    validUntil: valid_until ? new Date(valid_until) : null,
                    notes: notes?.trim() || null,
                    updatedById: userId,
                },
            });
        });
    }

    async markReceived(quotationId, userId, userRole, actingUser) {
        return this.#transition(quotationId, "draft", "received", userId, userRole, actingUser);
    }

    // Draft or received can both be discarded - only approved/rejected are terminal.
    async rejectQuotation(quotationId, userId, userRole, actingUser) {
        const quotation = await findQuotationById(quotationId);
        if (!quotation) {
            throw new ApiError(404, "Quotation not found");
        }
        if (userRole !== "admin" && quotation.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to update this quotation");
        }
        if (actingUser) assertPosAccess(actingUser, quotation.pointOfSaleId);
        if (!["draft", "received"].includes(quotation.status)) {
            throw new ApiError(
                400,
                `Cannot reject a quotation in "${quotation.status}" status`,
                [],
                "",
                "invalid_quotation_status_transition"
            );
        }

        // Atomic claim - same idiom as purchase.service.js#updatePurchaseStatus,
        // in case another tab already moved this quotation on (e.g. approved
        // it via conversion) between the read above and this write.
        const result = await prisma.purchaseQuotation.updateMany({
            where: { id: quotationId, status: quotation.status },
            data: { status: "rejected", updatedById: userId },
        });
        if (result.count === 0) {
            throw new ApiError(409, "This quotation was already updated elsewhere. Please refresh.");
        }
        return findQuotationById(quotationId);
    }

    async #transition(quotationId, fromStatus, toStatus, userId, userRole, actingUser) {
        const quotation = await findQuotationById(quotationId);
        if (!quotation) {
            throw new ApiError(404, "Quotation not found");
        }
        if (userRole !== "admin" && quotation.createdById !== userId) {
            throw new ApiError(403, "You don't have permission to update this quotation");
        }
        if (actingUser) assertPosAccess(actingUser, quotation.pointOfSaleId);
        if (quotation.status !== fromStatus) {
            throw new ApiError(
                400,
                `Cannot transition quotation from "${quotation.status}" to "${toStatus}"`,
                [],
                "",
                "invalid_quotation_status_transition"
            );
        }

        const result = await prisma.purchaseQuotation.updateMany({
            where: { id: quotationId, status: fromStatus },
            data: { status: toStatus, updatedById: userId },
        });
        if (result.count === 0) {
            throw new ApiError(409, "This quotation was already updated elsewhere. Please refresh.");
        }
        return findQuotationById(quotationId);
    }
}

export default new PurchaseQuotationService();
