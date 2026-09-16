import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureDefaultFixedAssetAccounts, ensureFixedAssetDisposalAccounts, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";
import { creditCashAccount, recordCashMovement } from "./cashMovement.service.js";

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const assetInclude = {
    assetAccount: { select: { id: true, code: true, name: true } },
    depreciationAccount: { select: { id: true, code: true, name: true } },
    expenseAccount: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
};

const mapFixedAsset = (asset) => ({
    _id: asset.id,
    name: asset.name,
    description: asset.description,
    acquisition_date: asset.acquisitionDate,
    acquisition_cost: Number(asset.acquisitionCost),
    salvage_value: Number(asset.salvageValue),
    useful_life_months: asset.usefulLifeMonths,
    months_depreciated: asset.monthsDepreciated,
    status: asset.status,
    last_depreciated_period: asset.lastDepreciatedPeriod,
    last_run_status: asset.lastRunStatus,
    last_run_error: asset.lastRunError,
    disposed_at: asset.disposedAt,
    disposal_reason: asset.disposalReason,
    disposal_amount: asset.disposalAmount != null ? Number(asset.disposalAmount) : null,
    disposal_gain_loss: asset.disposalGainLoss != null ? Number(asset.disposalGainLoss) : null,
    asset_account: asset.assetAccount ? { _id: asset.assetAccount.id, code: asset.assetAccount.code, name: asset.assetAccount.name } : undefined,
    depreciation_account: asset.depreciationAccount ? { _id: asset.depreciationAccount.id, code: asset.depreciationAccount.code, name: asset.depreciationAccount.name } : undefined,
    expense_account: asset.expenseAccount ? { _id: asset.expenseAccount.id, code: asset.expenseAccount.code, name: asset.expenseAccount.name } : undefined,
    cost_center: asset.costCenter ? { _id: asset.costCenter.id, code: asset.costCenter.code, name: asset.costCenter.name } : undefined,
    monthly_depreciation: monthlyDepreciationAmount(asset),
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
});

// Straight-line only. The last month true's-up rounding drift (usefulLife *
// the rounded monthly figure rarely lands exactly on cost - salvage) so the
// asset always finishes fully depreciated to the peso, never a few cents
// short or over.
const monthlyDepreciationAmount = (asset) => {
    const depreciable = Number(asset.acquisitionCost) - Number(asset.salvageValue);
    if (asset.usefulLifeMonths <= 0) return 0;
    return round2(depreciable / asset.usefulLifeMonths);
};

const nextDepreciationAmount = (asset) => {
    const depreciable = round2(Number(asset.acquisitionCost) - Number(asset.salvageValue));
    const monthly = monthlyDepreciationAmount(asset);
    const isLastMonth = asset.monthsDepreciated === asset.usefulLifeMonths - 1;
    return isLastMonth ? round2(depreciable - round2(monthly * (asset.usefulLifeMonths - 1))) : monthly;
};

// "America/Bogota" by default - same override recurringExpense.service.js/
// subscriptionRenewalScheduler.js use, so "which calendar month is this"
// reads the same everywhere a cron makes that call.
const currentLocalParts = (tz) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type).value;
    return { year: get("year"), month: get("month"), day: Number(get("day")) };
};

const resolveTimezone = () => {
    const tz = process.env.TIMEZONE || "America/Bogota";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz;
    } catch {
        return "UTC";
    }
};

export const listFixedAssets = async (accountId, { includeInactive = false } = {}) => {
    await ensureDefaultFixedAssetAccounts(prisma, accountId);
    const assets = await prisma.fixedAsset.findMany({
        where: { createdById: accountId, ...(includeInactive ? {} : { status: "active" }) },
        include: assetInclude,
        orderBy: [{ status: "asc" }, { acquisitionDate: "desc" }],
    });
    return assets.map(mapFixedAsset);
};

const validateAssetInputs = async (accountId, payload, { requireImmutableFields = true } = {}) => {
    const name = String(payload.name || "").trim();
    if (!name) throw new ApiError(400, "Fixed asset name is required.", [], "", "fixed_asset_name_required");
    if (name.length > 160) throw new ApiError(400, "Fixed asset name is too long.", [], "", "fixed_asset_name_too_long");

    const result = { name, description: String(payload.description || "").trim() || null };

    if (requireImmutableFields) {
        const acquisitionDate = new Date(payload.acquisition_date);
        const acquisitionCost = Number(Number(payload.acquisition_cost).toFixed(2));
        const salvageValue = Number(Number(payload.salvage_value ?? 0).toFixed(2));
        const usefulLifeMonths = Number(payload.useful_life_months);
        if (Number.isNaN(acquisitionDate.getTime())) throw new ApiError(400, "Acquisition date is invalid.", [], "", "fixed_asset_acquisition_date_invalid");
        if (!Number.isFinite(acquisitionCost) || acquisitionCost <= 0) throw new ApiError(400, "Acquisition cost must be greater than zero.", [], "", "fixed_asset_acquisition_cost_invalid");
        if (!Number.isFinite(salvageValue) || salvageValue < 0 || salvageValue >= acquisitionCost) {
            throw new ApiError(400, "Salvage value must be zero or more and less than the acquisition cost.", [], "", "fixed_asset_salvage_value_invalid");
        }
        if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 1 || usefulLifeMonths > 600) {
            throw new ApiError(400, "Useful life must be between 1 and 600 months.", [], "", "fixed_asset_useful_life_invalid");
        }
        Object.assign(result, { acquisitionDate, acquisitionCost, salvageValue, usefulLifeMonths });
    }

    const [assetAccount, depreciationAccount, expenseAccount] = await Promise.all([
        prisma.chartAccount.findFirst({ where: { id: payload.asset_account_id, createdById: accountId, accountType: "asset", isActive: true } }),
        prisma.chartAccount.findFirst({ where: { id: payload.depreciation_account_id, createdById: accountId, accountType: "asset", isActive: true } }),
        prisma.chartAccount.findFirst({ where: { id: payload.expense_account_id, createdById: accountId, accountType: "expense", isActive: true } }),
    ]);
    if (!assetAccount) throw new ApiError(404, "The asset account was not found or is inactive.", [], "", "fixed_asset_asset_account_unavailable");
    if (!depreciationAccount) throw new ApiError(404, "The accumulated depreciation account was not found or is inactive.", [], "", "fixed_asset_depreciation_account_unavailable");
    if (depreciationAccount.id === assetAccount.id) throw new ApiError(400, "The accumulated depreciation account must be different from the asset account.", [], "", "fixed_asset_accounts_must_differ");
    if (!expenseAccount) throw new ApiError(404, "The depreciation expense account was not found or is inactive.", [], "", "fixed_asset_expense_account_unavailable");

    if (payload.cost_center_id) {
        const costCenter = await prisma.costCenter.findFirst({ where: { id: payload.cost_center_id, accountId, isActive: true } });
        if (!costCenter) throw new ApiError(400, "The selected cost center does not exist or is inactive.", [], "", "fixed_asset_cost_center_invalid");
    }

    return { ...result, assetAccountId: assetAccount.id, depreciationAccountId: depreciationAccount.id, expenseAccountId: expenseAccount.id, costCenterId: payload.cost_center_id || null };
};

export const createFixedAsset = async (accountId, actorId, payload) => {
    const data = await validateAssetInputs(accountId, payload);
    const asset = await prisma.fixedAsset.create({ data: { createdById: accountId, ...data }, include: assetInclude });
    return mapFixedAsset(asset);
};

// Only name/description/cost center/accounts can be changed once
// depreciation has started (monthsDepreciated > 0) - the cost/salvage/
// useful-life inputs already drive a schedule with real postings behind it,
// so editing them retroactively would silently invalidate months already
// booked. Correcting a mistake there means deactivating this asset and
// registering a new one, same as a wrong recurring expense template.
export const updateFixedAsset = async (accountId, actorId, id, payload) => {
    const current = await prisma.fixedAsset.findFirst({ where: { id, createdById: accountId } });
    if (!current) throw new ApiError(404, "Fixed asset not found.", [], "", "fixed_asset_not_found");
    if (current.status !== "active") throw new ApiError(409, "Only an active fixed asset can be edited.", [], "", "fixed_asset_not_active");

    const immutableLocked = current.monthsDepreciated > 0;
    if (immutableLocked && (payload.acquisition_date || payload.acquisition_cost != null || payload.salvage_value != null || payload.useful_life_months != null)) {
        throw new ApiError(409, "Cost, salvage value, useful life, and acquisition date cannot change once depreciation has started.", [], "", "fixed_asset_schedule_locked");
    }

    const merged = {
        name: payload.name ?? current.name,
        description: payload.description ?? current.description,
        acquisition_date: payload.acquisition_date ?? current.acquisitionDate.toISOString(),
        acquisition_cost: payload.acquisition_cost ?? Number(current.acquisitionCost),
        salvage_value: payload.salvage_value ?? Number(current.salvageValue),
        useful_life_months: payload.useful_life_months ?? current.usefulLifeMonths,
        asset_account_id: payload.asset_account_id ?? current.assetAccountId,
        depreciation_account_id: payload.depreciation_account_id ?? current.depreciationAccountId,
        expense_account_id: payload.expense_account_id ?? current.expenseAccountId,
        cost_center_id: payload.cost_center_id !== undefined ? payload.cost_center_id : current.costCenterId,
    };
    const data = await validateAssetInputs(accountId, merged, { requireImmutableFields: !immutableLocked });
    const asset = await prisma.fixedAsset.update({ where: { id }, data, include: assetInclude });
    return mapFixedAsset(asset);
};

// "Baja de activo": removes the asset's cost and its accumulated
// depreciation from the books, deposits any sale proceeds into a cash
// account, and books the difference against net book value as a gain or
// loss. Accumulated depreciation is re-derived from this asset's own
// fixed_asset_depreciation lines (never trusted from monthsDepreciated,
// which is only a cron dedupe counter) so a disposal is always correct even
// if a run ever failed silently or the schedule was edited before this
// pass's edit lock existed.
export const disposeFixedAsset = async (accountId, actorId, id, { reason, disposalAmount = 0, cashAccountId } = {}) => {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) throw new ApiError(400, "A disposal reason is required.", [], "", "fixed_asset_disposal_reason_required");
    const amount = Number(Number(disposalAmount || 0).toFixed(2));
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "The disposal amount cannot be negative.", [], "", "fixed_asset_disposal_amount_invalid");

    const current = await prisma.fixedAsset.findFirst({ where: { id, createdById: accountId } });
    if (!current) throw new ApiError(404, "Fixed asset not found.", [], "", "fixed_asset_not_found");
    if (current.status !== "active") throw new ApiError(409, "Only an active fixed asset can be disposed.", [], "", "fixed_asset_not_active");

    let cashAccount = null;
    if (amount > 0) {
        if (!cashAccountId) throw new ApiError(400, "A cash account is required when there are disposal proceeds.", [], "", "fixed_asset_disposal_cash_account_required");
        cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId, isActive: true } });
        if (!cashAccount) throw new ApiError(404, "The cash account was not found or is inactive.", [], "", "fixed_asset_disposal_cash_account_unavailable");
    }

    return prisma.$transaction(async (tx) => {
        const depreciationAgg = await tx.journalEntryLine.aggregate({
            where: { chartAccountId: current.depreciationAccountId, journalEntry: { sourceType: "fixed_asset_depreciation", sourceId: current.id } },
            _sum: { debit: true, credit: true },
        });
        const accumulatedDepreciation = round2(Number(depreciationAgg._sum.credit || 0) - Number(depreciationAgg._sum.debit || 0));
        const netBookValue = round2(Number(current.acquisitionCost) - accumulatedDepreciation);
        const gainLoss = round2(amount - netBookValue);

        const { gain: gainAccount, loss: lossAccount } = await ensureFixedAssetDisposalAccounts(tx, accountId);

        const lines = [
            ...(accumulatedDepreciation > 0 ? [{ chartAccountId: current.depreciationAccountId, debit: accumulatedDepreciation, credit: 0, costCenterId: current.costCenterId }] : []),
            { chartAccountId: current.assetAccountId, debit: 0, credit: Number(current.acquisitionCost), costCenterId: current.costCenterId },
        ];
        if (amount > 0) {
            const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
            lines.push({ chartAccountId: cashChartAccountId, debit: amount, credit: 0, costCenterId: current.costCenterId });
        }
        if (gainLoss > 0) lines.push({ chartAccountId: gainAccount.id, debit: 0, credit: gainLoss, costCenterId: current.costCenterId });
        else if (gainLoss < 0) lines.push({ chartAccountId: lossAccount.id, debit: -gainLoss, credit: 0, costCenterId: current.costCenterId });

        const entry = await recordJournalEntry(tx, {
            accountId,
            createdById: actorId,
            entryDate: new Date(),
            description: `Baja de activo: ${current.name}. ${trimmedReason}`,
            sourceType: "fixed_asset_disposal",
            sourceId: current.id,
            lines,
        });

        if (amount > 0 && entry) {
            const balanceAfter = await creditCashAccount(tx, { cashAccountId: cashAccount.id, amount });
            await recordCashMovement(tx, {
                cashAccountId: cashAccount.id,
                delta: amount,
                balanceAfter,
                sourceType: "manual_deposit",
                sourceId: entry.id,
                reason: `Venta de activo: ${current.name}`,
                createdById: actorId,
            });
        }

        const asset = await tx.fixedAsset.update({
            where: { id },
            data: {
                status: "disposed",
                disposedAt: new Date(),
                disposedById: actorId,
                disposalReason: trimmedReason,
                disposalAmount: amount,
                disposalGainLoss: gainLoss,
            },
            include: assetInclude,
        });
        return mapFixedAsset(asset);
    }, { isolationLevel: "Serializable" });
};

// The actual posting, shared by the cron and "generar ahora" - identical
// shape to recurringExpense.service.js#postTemplateExpense but non-cash
// (debit the expense account, credit accumulated depreciation) and capped:
// once monthsDepreciated reaches usefulLifeMonths the asset is fully
// depreciated and never posts again.
const postAssetDepreciation = async (tx, accountId, actorId, asset, entryDate, period) => {
    const amount = nextDepreciationAmount(asset);
    const entry = await recordJournalEntry(tx, {
        accountId,
        createdById: actorId,
        entryDate,
        description: `Depreciación ${asset.name} (${period})`,
        sourceType: "fixed_asset_depreciation",
        sourceId: asset.id,
        lines: [
            { chartAccountId: asset.expenseAccountId, debit: amount, credit: 0, costCenterId: asset.costCenterId },
            { chartAccountId: asset.depreciationAccountId, debit: 0, credit: amount, costCenterId: asset.costCenterId },
        ],
    });

    const monthsDepreciated = asset.monthsDepreciated + 1;
    await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
            monthsDepreciated,
            status: monthsDepreciated >= asset.usefulLifeMonths ? "fully_depreciated" : "active",
            lastDepreciatedPeriod: period,
            lastRunStatus: "success",
            lastRunError: null,
        },
    });
    return entry;
};

const assertDepreciable = (asset, period) => {
    if (asset.status !== "active") throw new ApiError(400, "This fixed asset is not currently depreciating.", [], "", "fixed_asset_not_depreciable");
    if (asset.monthsDepreciated >= asset.usefulLifeMonths) throw new ApiError(400, "This fixed asset is already fully depreciated.", [], "", "fixed_asset_fully_depreciated");
    if (asset.lastDepreciatedPeriod === period) throw new ApiError(409, "This fixed asset already depreciated for the current period.", [], "", "fixed_asset_already_depreciated");
};

export const runFixedAssetDepreciationNow = async (accountId, actorId, id) => {
    const asset = await prisma.fixedAsset.findFirst({ where: { id, createdById: accountId } });
    if (!asset) throw new ApiError(404, "Fixed asset not found.", [], "", "fixed_asset_not_found");

    const { year, month } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;
    assertDepreciable(asset, period);

    try {
        const entry = await prisma.$transaction(
            (tx) => postAssetDepreciation(tx, accountId, actorId, asset, new Date(), period),
            { isolationLevel: "Serializable" }
        );
        return entry;
    } catch (err) {
        await prisma.fixedAsset.update({ where: { id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "fixed_asset_depreciation_failed" } });
        throw err instanceof ApiError ? err : new ApiError(422, "The depreciation entry could not be generated.", [], "", "fixed_asset_depreciation_failed");
    }
};

// Called daily by fixedAssetDepreciationScheduler.js across every tenant -
// same shape as recurringExpense.service.js#generateDueRecurringExpenses.
// No day-of-month gate (unlike recurring expenses): depreciation isn't
// user-scheduled, it's due for any active, not-yet-fully-depreciated asset
// that hasn't posted for the current calendar month yet.
export const generateDueFixedAssetDepreciation = async () => {
    const { year, month } = currentLocalParts(resolveTimezone());
    const period = `${year}-${month}`;

    const dueAssets = await prisma.fixedAsset.findMany({
        where: { status: "active", lastDepreciatedPeriod: { not: period } },
    });

    let posted = 0;
    let failed = 0;
    for (const asset of dueAssets) {
        try {
            await prisma.$transaction(
                (tx) => postAssetDepreciation(tx, asset.createdById, asset.createdById, asset, new Date(), period),
                { isolationLevel: "Serializable" }
            );
            posted++;
        } catch (err) {
            await prisma.fixedAsset.update({ where: { id: asset.id }, data: { lastRunStatus: "failed", lastRunError: err?.code || "fixed_asset_depreciation_failed" } });
            failed++;
        }
    }
    return { checked: dueAssets.length, posted, failed };
};
