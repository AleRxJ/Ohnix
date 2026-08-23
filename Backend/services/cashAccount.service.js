import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPointOfSaleExists } from "../middleware/pos.permissions.js";

// CashAccount is the caja/bank counterpart to PointOfSale/Product: a "cash"
// account belongs to exactly one location (the physical drawer), a "bank"
// account is usually account-wide (pointOfSaleId null) since one bank
// account is rarely tied to a single store. `balance` is a fast-read cache
// kept in sync by cashMovement.service.js#recordCashMovement, the same role
// Product.stock plays in front of StockMovement.

const scopeWhere = (accountId, posScopeAll, posScopeIds) => ({
    createdById: accountId,
    // A restricted-scope member sees accounts tied to a location they can
    // access, plus every account-wide (bank) account - a location scope has
    // no way to exclude someone from a bank account that isn't tied to any
    // single location in the first place.
    ...(posScopeAll ? {} : { OR: [{ pointOfSaleId: { in: posScopeIds || [] } }, { pointOfSaleId: null }] }),
});

export const listCashAccounts = async ({ accountId, posScopeAll, posScopeIds, includeInactive = false }) =>
    prisma.cashAccount.findMany({
        where: {
            ...scopeWhere(accountId, posScopeAll, posScopeIds),
            ...(includeInactive ? {} : { isActive: true }),
        },
        include: { pointOfSale: { select: { id: true, name: true } } },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });

export const getCashAccountById = async ({ accountId, posScopeAll, posScopeIds, id }) => {
    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id, ...scopeWhere(accountId, posScopeAll, posScopeIds) },
        include: { pointOfSale: { select: { id: true, name: true } } },
    });
    if (!cashAccount) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");
    return cashAccount;
};

export const createCashAccount = async ({ accountId, actorId, name, accountType, pointOfSaleId, bankName, accountNumber }) => {
    const trimmedName = `${name || ""}`.trim();
    if (!trimmedName) throw new ApiError(400, "El nombre de la cuenta es obligatorio.");
    if (!["cash", "bank"].includes(accountType)) {
        throw new ApiError(400, "El tipo de cuenta debe ser 'cash' o 'bank'.");
    }

    if (pointOfSaleId) {
        await assertPointOfSaleExists(accountId, pointOfSaleId);
    } else if (accountType === "cash") {
        throw new ApiError(400, "Una cuenta de caja debe estar asociada a un punto de venta.");
    }

    const cashAccount = await prisma.cashAccount.create({
        data: {
            name: trimmedName,
            accountType,
            pointOfSaleId: pointOfSaleId || null,
            bankName: accountType === "bank" ? bankName?.trim() || null : null,
            accountNumber: accountType === "bank" ? accountNumber?.trim() || null : null,
            createdById: accountId,
        },
        include: { pointOfSale: { select: { id: true, name: true } } },
    });

    return cashAccount;
};

export const updateCashAccount = async ({ accountId, id, name, bankName, accountNumber }) => {
    const existing = await prisma.cashAccount.findFirst({ where: { id, createdById: accountId } });
    if (!existing) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");

    return prisma.cashAccount.update({
        where: { id },
        data: {
            ...(name !== undefined && { name: `${name}`.trim() || existing.name }),
            ...(existing.accountType === "bank" && bankName !== undefined && { bankName: bankName?.trim() || null }),
            ...(existing.accountType === "bank" && accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
        },
        include: { pointOfSale: { select: { id: true, name: true } } },
    });
};

// Soft-delete only - same reasoning as PointOfSale.isActive: once a CashMovement
// references this account (ON DELETE RESTRICT), a hard delete would be blocked
// anyway. A deactivated account just stops appearing as a payment destination.
export const deactivateCashAccount = async ({ accountId, id }) => {
    const existing = await prisma.cashAccount.findFirst({ where: { id, createdById: accountId } });
    if (!existing) throw new ApiError(404, "Cuenta de caja/banco no encontrada.");

    return prisma.cashAccount.update({ where: { id }, data: { isActive: false } });
};
