import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { getIncomeStatement, getBalanceSheet } from "./financialStatements.service.js";
import { getIncomeTaxYearConfig, getSimpleRegimeBracketsForGroup } from "./incomeTaxConfig.service.js";
import { streamReportPdf } from "../utils/reportPdf.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const ANTICIPO_TIERS = { first: 25, second: 50, later: 75 };

// Ohnix doesn't model retenciones que le practican terceros a la empresa
// sobre sus propias ventas (only the reverse - PurchaseRetention, what this
// company withholds paying its OWN suppliers) - see exogenaReport.service.js's
// comment on the same asymmetry. The anticipo below is therefore gross,
// informational only, never netted against a real retention balance.
const buildAnticipo = (estimatedTax, tier) => {
    const percent = ANTICIPO_TIERS[tier] || ANTICIPO_TIERS.later;
    return { tier: tier && ANTICIPO_TIERS[tier] ? tier : "later", percent, amount: round2((estimatedTax * percent) / 100) };
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
        return {
            ...base,
            configured: true,
            rates_verified: yearConfig.is_verified,
            ordinary: {
                rate_percent: yearConfig.ordinary_rate_percent,
                taxable_gravable: taxableGravable,
                estimated_tax: estimatedTax,
                anticipo: buildAnticipo(estimatedTax, anticipoTier),
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
                [`Anticipo estimado (${declaration.ordinary.anticipo.percent}%)`, formatCOP(declaration.ordinary.anticipo.amount)],
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
