import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const TAX_TYPES = ["income", "vat", "ica"];
const round2 = (value) => Number(Number(value).toFixed(2));

export const summarizeWithholdingRows = (rows) => {
    const totals = { base: 0, withheld: 0, reversed: 0, net: 0 };
    const byType = new Map();
    for (const row of rows) {
        const type = row.tax_type || row.taxType;
        const base = Number(row.base_amount ?? row.baseAmount ?? 0);
        const withheld = Number(row.withheld_amount ?? row.withheldAmount ?? 0);
        const reversed = Number(row.returned_withheld_amount ?? row.returnedWithheldAmount ?? 0);
        totals.base += base;
        totals.withheld += withheld;
        totals.reversed += reversed;
        totals.net += withheld - reversed;
        const current = byType.get(type) || { tax_type: type, base: 0, withheld: 0, reversed: 0, net: 0, documents: 0 };
        current.base += base;
        current.withheld += withheld;
        current.reversed += reversed;
        current.net += withheld - reversed;
        current.documents += 1;
        byType.set(type, current);
    }
    const normalize = (item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === "number" && key !== "documents" ? round2(value) : value]));
    return { totals: normalize(totals), by_type: [...byType.values()].map(normalize) };
};

const serialize = (retention) => ({
    id: retention.id,
    purchase: {
        id: retention.purchase.id,
        number: retention.purchase.purchaseNo,
        date: retention.purchase.purchaseDate,
        status: retention.purchase.purchaseStatus,
    },
    supplier: {
        id: retention.purchase.supplier.id,
        name: retention.purchase.supplier.name,
        document: retention.purchase.supplier.identification,
    },
    concept_code: retention.conceptCode,
    concept_name: retention.conceptName,
    tax_type: retention.taxType,
    base_type: retention.baseType,
    rate_percent: Number(retention.ratePercent),
    base_amount: Number(retention.baseAmount),
    withheld_amount: Number(retention.withheldAmount),
    returned_base_amount: Number(retention.returnedBaseAmount),
    returned_withheld_amount: Number(retention.returnedWithheldAmount),
    net_withheld_amount: round2(Number(retention.withheldAmount) - Number(retention.returnedWithheldAmount)),
    municipality_code: retention.municipalityCode,
    chart_account: { id: retention.chartAccount.id, code: retention.chartAccount.code, name: retention.chartAccount.name },
});

export const getWithholdingReport = async ({ accountId, from, to, taxType, supplierId }) => {
    if (taxType && !TAX_TYPES.includes(taxType)) throw new ApiError(400, "Tipo de retención inválido.");
    const rows = await prisma.purchaseRetention.findMany({
        where: {
            purchase: {
                createdById: accountId,
                purchaseStatus: { in: ["completed", "returned"] },
                ...(from || to ? { purchaseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
                ...(supplierId ? { supplierId } : {}),
            },
            ...(taxType ? { taxType } : {}),
            withheldAmount: { gt: 0 },
        },
        include: {
            purchase: { include: { supplier: { select: { id: true, name: true, identification: true } } } },
            chartAccount: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ purchase: { purchaseDate: "asc" } }, { conceptCode: "asc" }],
    });
    const serialized = rows.map(serialize);
    return { ...summarizeWithholdingRows(serialized), rows: serialized };
};

export const getWithholdingCertificate = async ({ accountId, supplierId, year }) => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw new ApiError(400, "Año inválido.");
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, createdById: accountId }, select: { id: true, name: true, identification: true } });
    if (!supplier) throw new ApiError(404, "Proveedor no encontrado.");
    const from = new Date(Date.UTC(numericYear, 0, 1));
    const to = new Date(Date.UTC(numericYear + 1, 0, 1) - 1);
    const report = await getWithholdingReport({ accountId, supplierId, from, to });
    return { year: numericYear, supplier, generated_at: new Date(), ...report };
};
