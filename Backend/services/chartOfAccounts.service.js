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
    { code: "1330", name: "Anticipos a proveedores", accountType: "asset" },
    { code: "1435", name: "Inventarios", accountType: "asset" },
    { code: "2205", name: "Proveedores", accountType: "liability" },
    { code: "2805", name: "Anticipos recibidos de clientes", accountType: "liability" },
    { code: "240805", name: "IVA generado", accountType: "liability" },
    { code: "240810", name: "IVA descontable", accountType: "liability" },
    { code: "4135", name: "Ingresos por ventas", accountType: "revenue" },
    { code: "6135", name: "Costo de ventas", accountType: "cost" },
    { code: "4295", name: "Ingresos por ajustes de inventario", accountType: "revenue" },
    { code: "5195", name: "Pérdidas y ajustes de inventario", accountType: "expense" },
    // Fase 9 - manufacturing (see accountingPosting.service.js#
    // postProductionJournalEntry). Labor/overhead entered on a production
    // order gets capitalized into 1435 Inventarios (debit) against this one
    // accrued-liability account (credit) - the standard PUC code for a
    // recognized cost not yet paid out through cash/bank, since this
    // system has no payroll module a production order could otherwise
    // debit directly. Settling it later (recording the actual wage/
    // utility payment against it) is a manual journal entry, same as any
    // other accrued liability - out of scope for this phase.
    { code: "2335", name: "Costos y gastos por pagar", accountType: "liability" },
    // Fase 4 - nómina (see accountingPosting.service.js#postPayrollJournalEntry).
    // Net pay and every provisioned social benefit each get their own
    // payable account (rather than one lump "nómina por pagar") so the
    // balance sheet shows what's actually owed and when: 2505 is due almost
    // immediately, 2510/2515/2520/2525 are due on their own legal calendar
    // (cesantías by Feb 14, prima in June/December), and settling one of
    // them later never touches the others.
    { code: "5105", name: "Gastos de personal - Salarios", accountType: "expense" },
    { code: "5115", name: "Gastos de personal - Prestaciones sociales", accountType: "expense" },
    { code: "5120", name: "Gastos de personal - Aportes sobre la nómina", accountType: "expense" },
    { code: "2505", name: "Salarios por pagar", accountType: "liability" },
    { code: "2510", name: "Cesantías consolidadas", accountType: "liability" },
    { code: "2515", name: "Intereses sobre cesantías", accountType: "liability" },
    { code: "2520", name: "Prima de servicios por pagar", accountType: "liability" },
    { code: "2525", name: "Vacaciones consolidadas", accountType: "liability" },
    { code: "2530", name: "Aportes de seguridad social por pagar", accountType: "liability" },
    { code: "2531", name: "Aportes parafiscales por pagar", accountType: "liability" },
    { code: "2370", name: "Retención en la fuente por pagar (nómina)", accountType: "liability" },
    // Fase 3 (liquidación) - indemnización is never provisioned month-to-month
    // the way cesantías/prima/vacaciones are (it only exists if/when a
    // termination without justa causa actually happens), so it needs its own
    // expense account rather than reusing 5115 - see
    // accountingPosting.service.js#postTerminationSettlementJournalEntry.
    { code: "5116", name: "Gastos de personal - Indemnizaciones laborales", accountType: "expense" },
    // Fase 4 (multi-moneda) - only ever posted when a payment against a
    // foreign-currency Order/Purchase is registered with settleInFull and
    // the COP amount actually received/paid differs from what was booked at
    // the document's frozen exchange rate - see accountingPosting.service.js#
    // postOrderPaymentJournalEntry/postPurchasePaymentJournalEntry.
    { code: "4210", name: "Ingresos financieros - diferencia en cambio", accountType: "revenue" },
    { code: "5305", name: "Gastos financieros - diferencia en cambio", accountType: "expense" },
    // Fase 5 (causación automática) - default expense account a PaymentMethod
    // can point to (the user may instead point one at a different expense
    // account they already have) - see paymentMethod.service.js and
    // accountingPosting.service.js's payment-fee lines. Distinct code from
    // 5305 above, which Fase 4 already reserved specifically for diferencia
    // en cambio, not commissions.
    { code: "530520", name: "Comisiones bancarias y de pasarelas de pago", accountType: "expense" },
    // Retenciones que los CLIENTES le practican a esta empresa al pagarle
    // (OrderPayment.withheldIncomeTax/withheldVat/withheldIca) - anticipos
    // de impuestos (PUC 1355), not an expense: 135517 is swept by
    // vatSettlement.service.js, 135515 netted in rentaDeclaration.service.js.
    // Backfilled into older charts by getChartAccountMap on first posting.
    { code: "135515", name: "Retención en la fuente (a favor)", accountType: "asset" },
    { code: "135517", name: "Impuesto a las ventas retenido (ReteIVA a favor)", accountType: "asset" },
    { code: "135518", name: "Impuesto de industria y comercio retenido (ReteICA a favor)", accountType: "asset" },
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

const CAPITAL_CONTRIBUTION_ACCOUNT = { code: "3115", name: "Aportes sociales", accountType: "equity" };

// Fase 6 (estado de cambios en el patrimonio) - the credit side of every
// registerCapitalContribution (equityMovement.service.js). Same "created on
// first use" idiom as the two ensure* helpers above - a tenant that never
// registers a capital contribution never gets this account at all.
export const ensureCapitalContributionAccount = async (tx, accountId) => {
    await ensureDefaultChartOfAccounts(tx, accountId);
    const existing = await tx.chartAccount.findFirst({ where: { createdById: accountId, code: CAPITAL_CONTRIBUTION_ACCOUNT.code } });
    if (existing) return existing;
    return tx.chartAccount.create({ data: { ...CAPITAL_CONTRIBUTION_ACCOUNT, createdById: accountId } });
};

// GMF (4x1000) - banks list it as its own statement line on every debit, so
// BankReconciliationPanel.jsx's "Clasificar GMF" flow needs a dedicated
// expense account to preselect. 530505 rather than a 5115 subaccount because
// this chart already uses 5115 for prestaciones sociales (see above).
// upsert, not findFirst+create: this is called from a plain read (no tx), so
// two tabs opening the panel at once would otherwise race into P2002 on
// @@unique([createdById, code]).
const GMF_ACCOUNT = { code: "530505", name: "Gravamen a los movimientos financieros (4x1000)", accountType: "expense" };

const ensureNamedAccount = async (db, accountId, definition) => {
    await ensureDefaultChartOfAccounts(db, accountId);
    return db.chartAccount.upsert({
        where: { createdById_code: { createdById: accountId, code: definition.code } },
        update: {},
        create: { ...definition, createdById: accountId },
    });
};

export const ensureGmfAccount = (db, accountId) => ensureNamedAccount(db, accountId, GMF_ACCOUNT);

// Diferidos (prepaidExpense.service.js) - the default asset account a
// prepaid expense sits on until amortized; any active asset account works.
const PREPAID_EXPENSE_ACCOUNT = { code: "1705", name: "Gastos pagados por anticipado", accountType: "asset" };
export const ensurePrepaidExpenseAccount = (db, accountId) => ensureNamedAccount(db, accountId, PREPAID_EXPENSE_ACCOUNT);

// Deterioro de cartera (receivableImpairment.service.js): 1399 is a contra-
// asset (credit balance) netted against 1305 on the balance sheet.
const IMPAIRMENT_ACCOUNTS = {
    allowance: { code: "1399", name: "Deterioro acumulado de cartera", accountType: "asset" },
    expense: { code: "5199", name: "Gasto por deterioro de cartera", accountType: "expense" },
    recovery: { code: "4250", name: "Recuperación de deterioro de cartera", accountType: "revenue" },
};
export const ensureImpairmentAccounts = async (db, accountId) => ({
    allowance: await ensureNamedAccount(db, accountId, IMPAIRMENT_ACCOUNTS.allowance),
    expense: await ensureNamedAccount(db, accountId, IMPAIRMENT_ACCOUNTS.expense),
    recovery: await ensureNamedAccount(db, accountId, IMPAIRMENT_ACCOUNTS.recovery),
});

// Obligaciones financieras (financialObligation.service.js) - defaults only,
// any active liability/expense account can be chosen per loan. 530525
// rather than PUC's 530520 because this chart already uses 530520 for
// payment-gateway commissions.
const LOAN_ACCOUNTS = {
    liability: { code: "2105", name: "Obligaciones financieras - bancos nacionales", accountType: "liability" },
    interest: { code: "530525", name: "Gastos financieros - intereses", accountType: "expense" },
    // Causación of an installment's interest once its due date passes unpaid.
    accruedInterest: { code: "233510", name: "Intereses por pagar", accountType: "liability" },
};
export const ensureLoanAccounts = async (db, accountId) => ({
    liability: await ensureNamedAccount(db, accountId, LOAN_ACCOUNTS.liability),
    interest: await ensureNamedAccount(db, accountId, LOAN_ACCOUNTS.interest),
    accruedInterest: await ensureNamedAccount(db, accountId, LOAN_ACCOUNTS.accruedInterest),
});

// Declaración de ICA (icaDeclaration.service.js). 5117 follows this chart's
// own 51xx custom codes (5115/5116 are already personnel expenses here, so
// PUC's 511505 would land under "prestaciones sociales"); 2412 is the PUC
// liability. 135518 (ReteICA a favor) is a DEFAULT_ACCOUNTS entry.
const ICA_ACCOUNTS = {
    expense: { code: "5117", name: "Impuesto de industria y comercio, avisos y tableros", accountType: "expense" },
    payable: { code: "2412", name: "Impuesto de industria y comercio por pagar", accountType: "liability" },
};
export const ensureIcaAccounts = async (db, accountId) => {
    const coa = await getChartAccountMap(db, accountId);
    return {
        expense: await ensureNamedAccount(db, accountId, ICA_ACCOUNTS.expense),
        payable: await ensureNamedAccount(db, accountId, ICA_ACCOUNTS.payable),
        withheld: coa.get("135518"),
    };
};

// Liquidación de IVA (vatSettlement.service.js) - where the 240805/240810
// balances are swept to: the net owed to the DIAN, or the saldo a favor
// carried into the next period (PUC 1355 "Anticipo de impuestos y
// contribuciones o saldos a favor").
export const VAT_SETTLEMENT_ACCOUNT_CODES = { generated: "240805", deductible: "240810", withheld: "135517", payable: "240895", credit: "135520" };
const VAT_PAYABLE_ACCOUNT = { code: VAT_SETTLEMENT_ACCOUNT_CODES.payable, name: "IVA por pagar (liquidación)", accountType: "liability" };
const VAT_CREDIT_ACCOUNT = { code: VAT_SETTLEMENT_ACCOUNT_CODES.credit, name: "Saldo a favor en IVA", accountType: "asset" };

export const ensureVatSettlementAccounts = async (tx, accountId) => {
    const coa = await getChartAccountMap(tx, accountId);
    return {
        generated: coa.get(VAT_SETTLEMENT_ACCOUNT_CODES.generated),
        deductible: coa.get(VAT_SETTLEMENT_ACCOUNT_CODES.deductible),
        withheld: coa.get(VAT_SETTLEMENT_ACCOUNT_CODES.withheld),
        payable: await ensureNamedAccount(tx, accountId, VAT_PAYABLE_ACCOUNT),
        credit: await ensureNamedAccount(tx, accountId, VAT_CREDIT_ACCOUNT),
    };
};

// Fase 7 - a starting point for fixedAsset.service.js#createFixedAsset, not
// a hard requirement: registering an asset can point at any active asset/
// expense account instead (e.g. a company that wants "Flota y equipo de
// transporte" split from "Equipo de oficina"). Seeded together, one call,
// since a fixed asset always needs all three at once.
const FIXED_ASSET_DEFAULT_ACCOUNTS = {
    asset: { code: "1524", name: "Equipo de oficina", accountType: "asset" },
    depreciation: { code: "1592", name: "Depreciación acumulada", accountType: "asset" },
    expense: { code: "5160", name: "Depreciación", accountType: "expense" },
};

export const ensureDefaultFixedAssetAccounts = async (tx, accountId) => {
    await ensureDefaultChartOfAccounts(tx, accountId);
    const codes = Object.values(FIXED_ASSET_DEFAULT_ACCOUNTS).map((a) => a.code);
    const existing = await tx.chartAccount.findMany({ where: { createdById: accountId, code: { in: codes } } });
    const byCode = new Map(existing.map((a) => [a.code, a]));
    const result = {};
    for (const [key, definition] of Object.entries(FIXED_ASSET_DEFAULT_ACCOUNTS)) {
        result[key] = byCode.get(definition.code) || await tx.chartAccount.create({ data: { ...definition, createdById: accountId } });
    }
    return result;
};

// Fase 7 - gain/loss vs. net book value when a fixed asset is disposed (see
// fixedAsset.service.js#disposeFixedAsset). Two separate accounts (not one)
// because a single ChartAccount can't be both revenue and expense typed -
// only whichever side actually applies to a given disposal gets posted to.
const FIXED_ASSET_DISPOSAL_ACCOUNTS = {
    gain: { code: "4245", name: "Utilidad en venta de activos fijos", accountType: "revenue" },
    loss: { code: "530595", name: "Pérdida en venta de activos fijos", accountType: "expense" },
};

export const ensureFixedAssetDisposalAccounts = async (tx, accountId) => {
    await ensureDefaultChartOfAccounts(tx, accountId);
    const codes = Object.values(FIXED_ASSET_DISPOSAL_ACCOUNTS).map((a) => a.code);
    const existing = await tx.chartAccount.findMany({ where: { createdById: accountId, code: { in: codes } } });
    const byCode = new Map(existing.map((a) => [a.code, a]));
    const result = {};
    for (const [key, definition] of Object.entries(FIXED_ASSET_DISPOSAL_ACCOUNTS)) {
        result[key] = byCode.get(definition.code) || await tx.chartAccount.create({ data: { ...definition, createdById: accountId } });
    }
    return result;
};

// Manual additions to the default 9-account seed - e.g. a company that wants
// its own expense accounts (never auto-posted to, see accountingPosting.
// service.js's scope note) or a finer-grained split of an existing class.
// parentId is the hierarchy the schema always supported but the default
// seed never used (ChartAccount.parentId's own comment) - optional here too,
// a flat chart is still perfectly valid.
export const createChartAccount = async (accountId, actorId, { code, name, accountType, parentId }) => {
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

    const trimmedName = name.trim();
    return prisma.$transaction(async (tx) => {
        const account = await tx.chartAccount.create({
            data: { code: trimmedCode, name: trimmedName, accountType, parentId: parentId || null, createdById: accountId },
        });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "chart_account", entityId: account.id, action: "created", after: { code: trimmedCode, name: trimmedName, account_type: accountType, parent_id: parentId || null, is_active: true } },
        });
        return account;
    });
};

// Deactivating (never deleting) keeps every JournalEntryLine that already
// points at this account intact - same "never delete, only isActive" idiom
// used for products/cash accounts elsewhere. Reactivating is the same call
// with isActive: true.
export const setChartAccountActive = async (accountId, actorId, chartAccountId, isActive) => {
    const account = await prisma.chartAccount.findFirst({ where: { id: chartAccountId, createdById: accountId } });
    if (!account) throw new ApiError(404, "Chart account not found.", [], "", "chart_account_not_found");
    return prisma.$transaction(async (tx) => {
        const updated = await tx.chartAccount.update({ where: { id: chartAccountId }, data: { isActive } });
        await tx.accountingConfigAudit.create({
            data: { accountId, actorId, entityType: "chart_account", entityId: chartAccountId, action: isActive ? "activated" : "deactivated", before: { is_active: account.isActive }, after: { is_active: isActive } },
        });
        return updated;
    });
};
