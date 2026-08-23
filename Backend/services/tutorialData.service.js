import { prisma } from "../db/prisma.js";

// The only place that ever deletes a Purchase/Order/StockMovement row.
// Everywhere else in the app those are permanent by design (that's the
// whole point of the audit-trail work) - this is safe specifically because
// every row it touches was created by the interactive "how does Ohnix
// work" tour and flagged isTutorialData at creation time, scoped to the
// calling account, so it can never reach a real business record.
export const purgeTutorialData = async (accountId) => {
    const [orders, purchases, products, categories, units, suppliers, customers] =
        await Promise.all([
            prisma.order.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.purchase.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.product.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.category.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.unit.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.supplier.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
            prisma.customer.findMany({
                where: { createdById: accountId, isTutorialData: true },
                select: { id: true },
            }),
        ]);

    const orderIds = orders.map((o) => o.id);
    const purchaseIds = purchases.map((p) => p.id);

    await prisma.$transaction(async (tx) => {
        // A tutorial order should never have reached DIAN (see
        // order.service.js's isTutorialData guard), but clean up
        // defensively in case one was issued manually anyway.
        if (orderIds.length > 0) {
            const invoices = await tx.electronicInvoice.findMany({
                where: { orderId: { in: orderIds } },
                select: { id: true },
            });
            const invoiceIds = invoices.map((i) => i.id);
            if (invoiceIds.length > 0) {
                await tx.electronicInvoiceEvent.deleteMany({ where: { electronicInvoiceId: { in: invoiceIds } } });
                await tx.electronicCreditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
                await tx.electronicInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
            }
        }

        if (orderIds.length > 0) {
            await tx.orderDetail.deleteMany({ where: { orderId: { in: orderIds } } });
        }
        if (purchaseIds.length > 0) {
            await tx.purchaseDetail.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
        }
        if (orderIds.length > 0) {
            await tx.order.deleteMany({ where: { id: { in: orderIds } } });
        }
        if (purchaseIds.length > 0) {
            await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
        }
    });

    // Category/Unit/Supplier/Customer/Product might have been reused for
    // real records created outside the tour after the fact - attempt each
    // individually and skip (rather than fail the whole cleanup) if it's
    // still referenced by something.
    //
    // Products get the extra step of clearing their own stock ledger
    // (stockTransfer/productLocationStock/stockMovement - the latter two
    // added by the multi-location stock feature after this purge already
    // existed, each with its own RESTRICT-by-default FK back to Product)
    // bundled into the SAME per-product transaction as the delete itself:
    // if a real (non-tutorial) purchase or order still references this
    // product, the final `tx.product.delete` throws and the whole
    // transaction rolls back, leaving that product's real stock history
    // untouched rather than wiping it out ahead of a delete that was never
    // going to succeed.
    let categoriesDeleted = 0;
    let unitsDeleted = 0;
    let suppliersDeleted = 0;
    let customersDeleted = 0;
    let productsDeleted = 0;

    for (const { id } of products) {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.stockTransfer.deleteMany({ where: { productId: id } });
                await tx.productLocationStock.deleteMany({ where: { productId: id } });
                await tx.stockMovement.deleteMany({ where: { productId: id } });
                await tx.product.delete({ where: { id } });
            });
            productsDeleted += 1;
        } catch {
            // still in use - leave it (and its stock history) alone
        }
    }

    for (const { id } of categories) {
        try {
            await prisma.category.delete({ where: { id } });
            categoriesDeleted += 1;
        } catch {
            // still in use - leave it
        }
    }
    for (const { id } of units) {
        try {
            await prisma.unit.delete({ where: { id } });
            unitsDeleted += 1;
        } catch {
            // still in use - leave it
        }
    }
    for (const { id } of suppliers) {
        try {
            await prisma.supplier.delete({ where: { id } });
            suppliersDeleted += 1;
        } catch {
            // still in use - leave it
        }
    }
    for (const { id } of customers) {
        try {
            await prisma.customer.delete({ where: { id } });
            customersDeleted += 1;
        } catch {
            // still in use - leave it
        }
    }

    return {
        orders: orderIds.length,
        purchases: purchaseIds.length,
        products: productsDeleted,
        categories: categoriesDeleted,
        units: unitsDeleted,
        suppliers: suppliersDeleted,
        customers: customersDeleted,
    };
};
