import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

export const listAccountingPeriods = async (accountId) =>
    prisma.accountingPeriod.findMany({
        where: { createdById: accountId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
    });

// Only a period strictly before the current calendar month can be closed -
// this structurally prevents the one real accident this feature could cause
// (a closed period blocking new sales/purchases/payments): postings are
// always dated "now" (order.orderDate/purchase.purchaseDate/payment.paidAt),
// so the only period ever open for new business is the current one. Closing
// only ever applies to a month that's already in the past, which is exactly
// what "closing the books" is supposed to mean.
export const closeAccountingPeriod = async ({ accountId, actorId, periodId }) => {
    const period = await prisma.accountingPeriod.findFirst({ where: { id: periodId, createdById: accountId } });
    if (!period) throw new ApiError(404, "Periodo contable no encontrado.");
    if (period.status === "closed") throw new ApiError(400, "Este periodo ya está cerrado.");

    const now = new Date();
    if (period.year === now.getFullYear() && period.month === now.getMonth() + 1) {
        throw new ApiError(400, "No se puede cerrar el periodo del mes en curso.");
    }

    return prisma.accountingPeriod.update({
        where: { id: periodId },
        data: { status: "closed", closedAt: new Date(), closedById: actorId },
    });
};
