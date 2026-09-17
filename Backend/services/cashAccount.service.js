import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPointOfSaleExists } from "../middleware/pos.permissions.js";
import { getChartAccountMap } from "./chartOfAccounts.service.js";

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
        include: { pointOfSale: { select: { id: true, name: true } }, chartAccount: { select: { id: true, code: true, name: true, accountType: true } } },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });

export const getCashAccountById = async ({ accountId, posScopeAll, posScopeIds, id }) => {
    const cashAccount = await prisma.cashAccount.findFirst({
        where: { id, ...scopeWhere(accountId, posScopeAll, posScopeIds) },
        include: { pointOfSale: { select: { id: true, name: true } }, chartAccount: { select: { id: true, code: true, name: true, accountType: true } } },
    });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "cash_account_not_found");
    return cashAccount;
};

const resolveSelectedChartAccount = async (accountId, chartAccountId, accountType, db = prisma) => {
    if (!chartAccountId) {
        const coa = await getChartAccountMap(db, accountId);
        return coa.get(accountType === "bank" ? "1110" : "1105").id;
    }
    const selected = await db.chartAccount.findFirst({ where: { id: chartAccountId, createdById: accountId, accountType: "asset", isActive: true } });
    if (!selected) throw new ApiError(404, "The chart account must exist, be active, and have asset type.", [], "", "cash_account_chart_account_invalid");
    return selected.id;
};

export const createCashAccount = async ({ accountId, actorId, name, accountType, pointOfSaleId, bankName, accountNumber, chartAccountId: selectedChartAccountId }) => {
    const trimmedName = `${name || ""}`.trim();
    if (!trimmedName) throw new ApiError(400, "Cash account name is required.", [], "", "cash_account_name_required");
    if (!["cash", "bank"].includes(accountType)) {
        throw new ApiError(400, "Cash account type must be cash or bank.", [], "", "cash_account_type_invalid");
    }

    if (pointOfSaleId) {
        await assertPointOfSaleExists(accountId, pointOfSaleId);
    } else if (accountType === "cash") {
        throw new ApiError(400, "A cash account must be associated with a location.", [], "", "cash_account_location_required");
    }

    // Which PUC ledger account this cash account posts to by default (Fase
    // 4, contabilidad automática) - 1105 Caja / 1110 Bancos. Resolved here
    // rather than left null, so a brand-new account never needs the lazy
    // backfill path (chartOfAccounts.service.js#resolveCashAccountChartAccount)
    // that only exists for accounts created before this feature shipped.
    const chartAccountId = await resolveSelectedChartAccount(accountId, selectedChartAccountId, accountType);

    const cashAccount = await prisma.cashAccount.create({
        data: {
            name: trimmedName,
            accountType,
            pointOfSaleId: pointOfSaleId || null,
            bankName: accountType === "bank" ? bankName?.trim() || null : null,
            accountNumber: accountType === "bank" ? accountNumber?.trim() || null : null,
            createdById: accountId,
            chartAccountId,
        },
        include: { pointOfSale: { select: { id: true, name: true } }, chartAccount: { select: { id: true, code: true, name: true, accountType: true } } },
    });

    return cashAccount;
};

export const updateCashAccount = async ({ accountId, actorId, id, name, bankName, accountNumber, chartAccountId }) => {
    const existing = await prisma.cashAccount.findFirst({ where: { id, createdById: accountId }, include: { chartAccount: { select: { id: true, code: true, name: true } } } });
    if (!existing) throw new ApiError(404, "Cash account not found.", [], "", "cash_account_not_found");
    return prisma.$transaction(async (tx) => {
        const validatedChartAccountId = chartAccountId !== undefined ? await resolveSelectedChartAccount(accountId, chartAccountId, existing.accountType, tx) : undefined;
        const updated = await tx.cashAccount.update({
            where: { id },
            data: {
                ...(name !== undefined && { name: `${name}`.trim() || existing.name }),
                ...(existing.accountType === "bank" && bankName !== undefined && { bankName: bankName?.trim() || null }),
                ...(existing.accountType === "bank" && accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
                ...(validatedChartAccountId !== undefined && { chartAccountId: validatedChartAccountId }),
            },
            include: { pointOfSale: { select: { id: true, name: true } }, chartAccount: { select: { id: true, code: true, name: true, accountType: true } } },
        });
        if (validatedChartAccountId !== undefined && validatedChartAccountId !== existing.chartAccountId) {
            await tx.accountingConfigAudit.create({ data: { accountId, actorId, entityType: "cash_account", entityId: id, action: "chart_account_changed", before: existing.chartAccount ? { id: existing.chartAccount.id, code: existing.chartAccount.code, name: existing.chartAccount.name } : null, after: updated.chartAccount ? { id: updated.chartAccount.id, code: updated.chartAccount.code, name: updated.chartAccount.name } : null } });
        }
        return updated;
    });
};

export const listCashAccountConfigurationHistory = async ({ accountId, id }) => {
    const exists = await prisma.cashAccount.findFirst({ where: { id, createdById: accountId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "Cash account not found.", [], "", "cash_account_not_found");
    return prisma.accountingConfigAudit.findMany({ where: { accountId, entityType: "cash_account", entityId: id }, include: { actor: { select: { id: true, username: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
};

// Soft-delete only - same reasoning as PointOfSale.isActive: once a CashMovement
// references this account (ON DELETE RESTRICT), a hard delete would be blocked
// anyway. A deactivated account just stops appearing as a payment destination.
export const deactivateCashAccount = async ({ accountId, id }) => {
    const existing = await prisma.cashAccount.findFirst({ where: { id, createdById: accountId } });
    if (!existing) throw new ApiError(404, "Cash account not found.", [], "", "cash_account_not_found");

    return prisma.cashAccount.update({ where: { id }, data: { isActive: false } });
};
