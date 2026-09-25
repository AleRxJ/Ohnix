import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { getIncomeStatement, getBalanceSheet } from "./financialStatements.service.js";
import { getIncomeTaxYearConfig, getSimpleRegimeBracketsForGroup } from "./incomeTaxConfig.service.js";
import { streamReportPdf } from "../utils/reportPdf.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const ANTICIPO_TIERS = { first: 25, second: 50, later: 75 };

// Anticipo for the following year, ET art. 807 (método de la renta líquida):
// impuesto x porcentaje, less the retenciones en la fuente the company
// suffered during the year - never negative. Retenciones sufridas come from
// the customer payments that recorded them (OrderPayment.withheldIncomeTax,
// posted to 135515 - see accountingPosting.service.js#postOrderPaymentJournalEntry).
// The prior year's anticipo isn't modeled, so balanceDue is an upper bound.
export const buildRentaSettlement = (estimatedTax, tier, withholdingsSuffered = 0) => {
    const percent = ANTICIPO_TIERS[tier] || ANTICIPO_TIERS.later;
    const withholdings = round2(withholdingsSuffered);
    const grossAnticipo = round2((estimatedTax * percent) / 100);
    const anticipo = { tier: tier && ANTICIPO_TIERS[tier] ? tier : "later", percent, gross_amount: grossAnticipo, amount: Math.max(round2(grossAnticipo - withholdings), 0) };
    return { anticipo, withholdingsSuffered: withholdings, balanceDue: round2(estimatedTax - withholdings + anticipo.amount) };
};

// Debits minus credits on 135515 dated within the year - the year's own
// retenciones, not the account's lifetime balance (nothing ever clears
// 135515 yet, so its balance would re-count earlier years).
export const loadIncomeTaxWithholdings = async (accountId, from, to) => {
    const agg = await prisma.journalEntryLine.aggregate({
        where: { chartAccount: { createdById: accountId, code: "135515" }, journalEntry: { entryDate: { gte: from, lte: to } } },
        _sum: { debit: true, credit: true },
    });
    return round2(Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0));
};

// Never a certified DIAN filing - see IncomeTaxYearConfig/SimpleRegimeBracket's
// schema comments on why every number below carries `estimated: true` and
// `rates_verified`. Renta líquida gravable starts from the same net_income
// getIncomeStatement already reports (books, not fiscal) - manualAdjustments
// lets the caller layer ingresos no constitutivos / gastos no deducibles on
// top, since Ohnix doesn't distinguish libros vs. fiscal in the ledger itself.
export const getRentaDeclaration = async ({ accountId, year, manualAdjustments = 0, anticipoTier }) => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
        throw new ApiError(400, "The declaration year is invalid.", [], "", "renta_invalid_year");
    }
    const adjustments = round2(manualAdjustments);
    const from = new Date(Date.UTC(numericYear, 0, 1));
    const to = new Date(Date.UTC(numericYear + 1, 0, 1) - 1);

    const account = await prisma.user.findUnique({
        where: { id: accountId },
        select: { company: { select: { name: true, legalName: true, taxIdentification: true, taxIdentificationDv: true, taxRegime: true, simpleRegimeGroup: true } } },
    });
    const company = account?.company || null;

    const [incomeStatement, balanceSheet] = await Promise.all([
        getIncomeStatement({ accountId, startDate: from, endDate: to }),
        getBalanceSheet({ accountId, asOfDate: to }),
    ]);

    const netIncome = incomeStatement.net_income;
    const taxableIncome = round2(netIncome + adjustments);

    const base = {
        year: numericYear,
        company: company ? { name: company.name, legal_name: company.legalName, tax_identification: company.taxIdentification, tax_identification_dv: company.taxIdentificationDv } : null,
        tax_regime: company?.taxRegime || null,
        patrimonio_bruto: balanceSheet.total_assets,
        patrimonio_liquido: balanceSheet.total_equity,
        total_revenue: incomeStatement.total_revenue,
        total_costs: incomeStatement.total_costs,
        total_expenses: incomeStatement.total_expenses,
        net_income: netIncome,
        manual_adjustments: adjustments,
        taxable_income: taxableIncome,
        estimated: true,
    };

    if (!company?.taxRegime) return { ...base, configured: false, reason: "tax_regime_not_set" };

    if (company.taxRegime === "ordinario") {
        const yearConfig = await getIncomeTaxYearConfig(numericYear);
        if (!yearConfig) return { ...base, configured: false, reason: "year_config_missing" };
        const taxableGravable = Math.max(taxableIncome, 0);
        const estimatedTax = round2((taxableGravable * yearConfig.ordinary_rate_percent) / 100);
        const settlement = buildRentaSettlement(estimatedTax, anticipoTier, await loadIncomeTaxWithholdings(accountId, from, to));
        return {
            ...base,
            configured: true,
            rates_verified: yearConfig.is_verified,
            ordinary: {
                rate_percent: yearConfig.ordinary_rate_percent,
                taxable_gravable: taxableGravable,
                estimated_tax: estimatedTax,
                withholdings_suffered: settlement.withholdingsSuffered,
                anticipo: settlement.anticipo,
                balance_due: settlement.balanceDue,
            },
        };
    }

    // simple
    if (!company.simpleRegimeGroup) return { ...base, configured: false, reason: "simple_regime_group_missing" };
    const yearConfig = await getIncomeTaxYearConfig(numericYear);
    if (!yearConfig) return { ...base, configured: false, reason: "year_config_missing" };
    const brackets = await getSimpleRegimeBracketsForGroup(numericYear, company.simpleRegimeGroup);
    if (brackets.length === 0) return { ...base, configured: false, reason: "brackets_missing" };

    // RST's base is total gross income (ordinary + extraordinary), not net
    // income - it taxes revenue directly, costs/expenses are irrelevant to
    // the calculation (Art. 908 ET).
    const grossIncome = round2(incomeStatement.total_revenue);
    const grossIncomeUvt = round2(grossIncome / yearConfig.uvt_value);
    const bracket = brackets.find((b) => grossIncomeUvt >= b.min_uvt && (b.max_uvt === null || grossIncomeUvt < b.max_uvt)) || brackets[brackets.length - 1];
    const estimatedTax = round2((grossIncome * bracket.rate_percent) / 100);

    return {
        ...base,
        configured: true,
        rates_verified: yearConfig.is_verified && bracket.is_verified,
        simple: {
            group: company.simpleRegimeGroup,
            uvt_value: yearConfig.uvt_value,
            gross_income: grossIncome,
            gross_income_uvt: grossIncomeUvt,
            bracket,
            estimated_tax: estimatedTax,
        },
    };
};

const formatCOP = (value) => `$${Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

export const renderRentaDeclarationPdf = (res, declaration) => {
    const regimeLabel = declaration.tax_regime === "simple" ? "Régimen Simple de Tributación" : "Régimen Ordinario";
    const sections = [
        {
            heading: "Patrimonio",
            summary: [
                ["Patrimonio bruto", formatCOP(declaration.patrimonio_bruto)],
                ["Patrimonio líquido", formatCOP(declaration.patrimonio_liquido)],
            ],
        },
        {
            heading: "Renta líquida",
            summary: [
                ["Ingresos", formatCOP(declaration.total_revenue)],
                ["Costos", formatCOP(declaration.total_costs)],
                ["Gastos", formatCOP(declaration.total_expenses)],
                ["Utilidad contable (libros)", formatCOP(declaration.net_income)],
                ["Ajustes manuales", formatCOP(declaration.manual_adjustments)],
                ["Renta líquida (base)", formatCOP(declaration.taxable_income)],
            ],
        },
    ];

    if (declaration.ordinary) {
        sections.push({
            heading: `Liquidación estimada — ${regimeLabel}`,
            summary: [
                ["Tarifa aplicada", `${declaration.ordinary.rate_percent}%`],
                ["Renta líquida gravable", formatCOP(declaration.ordinary.taxable_gravable)],
                ["Impuesto de renta estimado", formatCOP(declaration.ordinary.estimated_tax)],
                ["(−) Retenciones en la fuente que le practicaron", formatCOP(declaration.ordinary.withholdings_suffered)],
                [`(+) Anticipo año siguiente (${declaration.ordinary.anticipo.percent}%, neto de retenciones)`, formatCOP(declaration.ordinary.anticipo.amount)],
                [declaration.ordinary.balance_due < 0 ? "Saldo a favor estimado" : "Saldo a pagar estimado", formatCOP(Math.abs(declaration.ordinary.balance_due))],
            ],
        });
    } else if (declaration.simple) {
        sections.push({
            heading: `Liquidación estimada — ${regimeLabel}`,
            summary: [
                ["Grupo de actividad", declaration.simple.group],
                ["Ingresos brutos", formatCOP(declaration.simple.gross_income)],
                ["Ingresos brutos en UVT", declaration.simple.gross_income_uvt],
                ["Tarifa del tramo", `${declaration.simple.bracket.rate_percent}%`],
                ["Impuesto SIMPLE estimado", formatCOP(declaration.simple.estimated_tax)],
            ],
        });
    }

    streamReportPdf(res, {
        companyName: declaration.company?.legal_name || declaration.company?.name || "Ohnix",
        title: "Declaración de Renta (estimado)",
        subtitle: declaration.rates_verified
            ? `Año gravable ${declaration.year} — ${regimeLabel}`
            : `Año gravable ${declaration.year} — ${regimeLabel} — CIFRAS DE REFERENCIA SIN VERIFICAR, CONFIRME CON SU CONTADOR ANTES DE DECLARAR`,
        sections,
    });
};
