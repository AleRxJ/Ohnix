import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense", "cost"];

// Minimal Colombian PUC (Plan Único de Cuentas) seed - just enough accounts
// for the 4 automatic postings this phase covers (venta, compra, pago de
// pedido, pago de compra). Not a full PUC, not hierarchical (parentId stays
// null here - reserved for an account added by hand later).
const DEFAULT_ACCOUNTS = [
    { code: "1105", name: "Caja", accountType: "asset" },
    { code: "1110", name: "Bancos", accountType: "asset" },
    { code: "1305", name: "Clientes", accountType: "asset" },
    { code: "1435", name: "Inventarios", accountType: "asset" },
    { code: "2205", name: "Proveedores", accountType: "liability" },
    { code: "240805", name: "IVA generado", accountType: "liability" },
    { code: "240810", name: "IVA descontable", accountType: "liability" },
    { code: "4135", name: "Ingresos por ventas", accountType: "revenue" },
    { code: "6135", name: "Costo de ventas", accountType: "cost" },
    { code: "4295", name: "Ingresos por ajustes de inventario", accountType: "revenue" },
    { code: "5195", name: "Pérdidas y ajustes de inventario", accountType: "expense" },
];

// Lazily seeds the default chart the first time a tenant needs one - same
// "created on first use" idiom as pointOfSale.service.js#ensureDefaultPointOfSale.
// `db` is either `prisma` (standalone reads) or a `tx` client (called from
// inside the transaction that's about to post against it, so a brand-new
// tenant's first-ever sale and first-ever purchase can't race each other
// into seeding the chart twice).
export const ensureDefaultChartOfAccounts = async (db, accountId) => {
    const existing = await db.chartAccount.findMany({ where: { createdById: accountId } });
    if (existing.length > 0) return existing;

    for (const account of DEFAULT_ACCOUNTS) {
        await db.chartAccount.create({ data: { ...account, createdById: accountId } });
    }
    return db.chartAccount.findMany({ where: { createdById: accountId } });
};

export const getChartAccountMap = async (db, accountId) => {
    const accounts = await ensureDefaultChartOfAccounts(db, accountId);
    for (const account of DEFAULT_ACCOUNTS) {
        if (!accounts.some((existing) => existing.code === account.code)) {
            accounts.push(await db.chartAccount.create({ data: { ...account, createdById: accountId } }));
        }
    }
    return new Map(accounts.map((a) => [a.code, a]));
};

// Resolves which ChartAccount a CashAccount posts to - already set for
// accounts created after this phase shipped (cashAccount.service.js), lazily
// backfilled here for ones created before it (chartAccountId still null).
export const resolveCashAccountChartAccount = async (tx, accountId, cashAccount) => {
    if (cashAccount.chartAccountId) return cashAccount.chartAccountId;

    const coa = await getChartAccountMap(tx, accountId);
    const code = cashAccount.accountType === "bank" ? "1110" : "1105";
    const chartAccount = coa.get(code);

    await tx.cashAccount.update({ where: { id: cashAccount.id }, data: { chartAccountId: chartAccount.id } });
    return chartAccount.id;
};

export const listChartAccounts = async (accountId) => ensureDefaultChartOfAccounts(prisma, accountId);

const RETAINED_EARNINGS_ACCOUNT = { code: "3605", name: "Utilidades acumuladas", accountType: "equity" };

// Lazily adds the retained-earnings account for tenants whose chart was
// seeded before period-close existed (their 9 DEFAULT_ACCOUNTS won't include
// it) - same "created on first use" idiom as ensureDefaultChartOfAccounts,
// called from fiscalYear.service.js#closeFiscalYear right before it needs
// somewhere to post a closed year's net result.
export const ensureRetainedEarningsAccount = async (tx, accountId) => {
    await ensureDefaultChartOfAccounts(tx, accountId);
    const existing = await tx.chartAccount.findFirst({ where: { createdById: accountId, code: RETAINED_EARNINGS_ACCOUNT.code } });
    if (existing) return existing;
    return tx.chartAccount.create({ data: { ...RETAINED_EARNINGS_ACCOUNT, createdById: accountId } });
};

const CURRENT_YEAR_EARNINGS_ACCOUNT = { code: "3610", name: "Utilidad del ejercicio", accountType: "equity" };

// Fase 6 - where a MONTHLY period close now posts that month's net result,
// instead of RETAINED_EARNINGS_ACCOUNT directly (see
// accountingPeriod.service.js#closeAccountingPeriod). This account
// accumulates the current fiscal year's result month by month; closing the
// FISCAL YEAR (fiscalYear.service.js#closeFiscalYear) sweeps its balance into
// 3605 and leaves it at zero for the next year. Keeping the two separate is
// what lets the balance sheet show "this year's result" and "accumulated
// from prior years" as distinct equity lines instead of one indistinguishable
// bucket - the gap a plain 3605-only close left unaddressed.
export const ensureCurrentYearEarningsAccount = async (tx, accountId) => {
    await ensureDefaultChartOfAccounts(tx, accountId);
    const existing = await tx.chartAccount.findFirst({ where: { createdById: accountId, code: CURRENT_YEAR_EARNINGS_ACCOUNT.code } });
    if (existing) return existing;
    return tx.chartAccount.create({ data: { ...CURRENT_YEAR_EARNINGS_ACCOUNT, createdById: accountId } });
};

// Manual additions to the default 9-account seed - e.g. a company that wants
// its own expense accounts (never auto-posted to, see accountingPosting.
// service.js's scope note) or a finer-grained split of an existing class.
// parentId is the hierarchy the schema always supported but the default
// seed never used (ChartAccount.parentId's own comment) - optional here too,
// a flat chart is still perfectly valid.
export const createChartAccount = async (accountId, { code, name, accountType, parentId }) => {
    if (!code?.trim()) throw new ApiError(400, "Account code is required.", [], "", "chart_account_code_required");
    if (!name?.trim()) throw new ApiError(400, "Account name is required.", [], "", "chart_account_name_required");
    if (!ACCOUNT_TYPES.includes(accountType)) {
        throw new ApiError(400, `accountType must be one of: ${ACCOUNT_TYPES.join(", ")}.`, [], "", "chart_account_type_invalid");
    }

    const trimmedCode = code.trim();
    const existing = await prisma.chartAccount.findFirst({ where: { createdById: accountId, code: trimmedCode } });
    if (existing) throw new ApiError(409, `An account with code ${trimmedCode} already exists.`, [], "", "chart_account_code_duplicate");

    if (parentId) {
        const parent = await prisma.chartAccount.findFirst({ where: { id: parentId, createdById: accountId } });
        if (!parent) throw new ApiError(400, "The selected parent account does not exist.", [], "", "chart_account_parent_not_found");
    }

    return prisma.chartAccount.create({
        data: { code: trimmedCode, name: name.trim(), accountType, parentId: parentId || null, createdById: accountId },
    });
};

// Deactivating (never deleting) keeps every JournalEntryLine that already
// points at this account intact - same "never delete, only isActive" idiom
// used for products/cash accounts elsewhere. Reactivating is the same call
// with isActive: true.
export const setChartAccountActive = async (accountId, chartAccountId, isActive) => {
    const account = await prisma.chartAccount.findFirst({ where: { id: chartAccountId, createdById: accountId } });
    if (!account) throw new ApiError(404, "Chart account not found.", [], "", "chart_account_not_found");
    return prisma.chartAccount.update({ where: { id: chartAccountId }, data: { isActive } });
};
