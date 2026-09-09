import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import PDFDocument from "pdfkit";

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
    if (taxType && !TAX_TYPES.includes(taxType)) throw new ApiError(400, "The withholding tax type is invalid.", [], "", "withholding_tax_type_invalid");
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
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw new ApiError(400, "The certificate year is invalid.", [], "", "withholding_certificate_year_invalid");
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, createdById: accountId }, select: { id: true, name: true, identification: true } });
    if (!supplier) throw new ApiError(404, "Supplier not found.", [], "", "withholding_supplier_not_found");
    const from = new Date(Date.UTC(numericYear, 0, 1));
    const to = new Date(Date.UTC(numericYear + 1, 0, 1) - 1);
    const account = await prisma.user.findUnique({
        where: { id: accountId },
        select: { company: { select: { name: true, legalName: true, taxIdentification: true, taxIdentificationDv: true, contactEmail: true, phone: true } } },
    });
    const report = await getWithholdingReport({ accountId, supplierId, from, to });
    return { year: numericYear, supplier, company: account?.company || null, generated_at: new Date(), ...report };
};

export const renderWithholdingCertificatePdf = (res, certificate, requestedLanguage = "es") => {
    const language = requestedLanguage === "en" ? "en" : "es";
    const copy = language === "en" ? {
        missingCompany: "Company legal name not configured", missing: "Not configured", traceability: "ACCOUNTING TRACEABILITY",
        heading: "WITHHOLDING CERTIFICATE", agent: "WITHHOLDING AGENT", subject: "WITHHELD PARTY", document: "Document",
        period: "Certified period: January 1 through December 31", type: "WITHHOLDING TYPE", documents: "DOCUMENTS", net: "NET AMOUNT",
        total: "TOTAL NET CERTIFIED", notice: "This certificate is generated from purchases and returns recorded in Ohnix. It must be reviewed by the accounting professional before delivery or tax use.",
        generated: "Generated", labels: { income: "Income tax withholding", vat: "VAT withholding", ica: "ICA withholding" }, file: "withholding-certificate",
    } : {
        missingCompany: "Empresa sin razón social configurada", missing: "No configurado", traceability: "TRAZABILIDAD CONTABLE",
        heading: "CERTIFICADO DE RETENCIONES", agent: "AGENTE RETENEDOR", subject: "SUJETO DE RETENCIÓN", document: "Documento",
        period: "Periodo certificado: 1 de enero a 31 de diciembre de", type: "TIPO DE RETENCIÓN", documents: "DOCUMENTOS", net: "VALOR NETO",
        total: "TOTAL NETO CERTIFICADO", notice: "Este certificado se genera con las compras y devoluciones registradas en Ohnix. Debe ser revisado por el responsable contable antes de su entrega o uso tributario.",
        generated: "Generado", labels: { income: "Retención en la fuente", vat: "Retención de IVA", ica: "Retención de ICA" }, file: "certificado-retenciones",
    };
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const company = certificate.company || {};
    const companyName = company.legalName || company.name || copy.missingCompany;
    const nit = company.taxIdentification ? `${company.taxIdentification}${company.taxIdentificationDv ? `-${company.taxIdentificationDv}` : ""}` : copy.missing;
    const locale = language === "en" ? "en-US" : "es-CO";
    const money = (value) => new Intl.NumberFormat(locale, { style: "currency", currency: "COP", minimumFractionDigits: 2 }).format(Number(value || 0));
    const teal = "#0B7A78";
    const ink = "#111827";
    const muted = "#6B7280";
    const line = "#E5E7EB";
    const safeDocument = `${certificate.supplier.identification || certificate.supplier.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${copy.file}-${safeDocument}-${certificate.year}.pdf`);
    doc.pipe(res);

    const gradient = doc.linearGradient(0, 0, 595, 118).stop(0, "#0B0F19").stop(1, "#0E302E");
    doc.rect(0, 0, 595, 118).fill(gradient);
    doc.font("Helvetica-Bold").fontSize(19).fillColor("#29D8D5").text("OHNIX", 50, 30, { characterSpacing: 2 });
    doc.fontSize(8).fillColor("#A7B0BC").text(copy.traceability, 50, 55, { characterSpacing: 1 });
    doc.fontSize(9).fillColor("#29D8D5").text(copy.heading, 300, 30, { width: 245, align: "right" });
    doc.fontSize(22).fillColor("#FFFFFF").text(`${certificate.year}`, 300, 48, { width: 245, align: "right" });
    doc.rect(0, 115, 595, 3).fill("#29D8D5");

    doc.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(copy.agent, 50, 145);
    doc.fontSize(14).fillColor(ink).text(companyName, 50, 162, { width: 495 });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`NIT ${nit}`, 50, 184);
    if (company.contactEmail || company.phone) doc.text([company.contactEmail, company.phone].filter(Boolean).join("  ·  "), 50, 199);

    doc.moveTo(50, 224).lineTo(545, 224).strokeColor(line).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(copy.subject, 50, 245);
    doc.fontSize(14).fillColor(ink).text(certificate.supplier.name, 50, 262);
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`${copy.document} ${certificate.supplier.identification || copy.missing}`, 50, 283);
    doc.text(`${copy.period} ${certificate.year}`, 50, 304);

    let y = 345;
    doc.rect(50, y, 495, 28).fill("#F0FDFA");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(teal).text(copy.type, 62, y + 10);
    doc.text(copy.documents, 280, y + 10, { width: 80, align: "right" });
    doc.text(copy.net, 395, y + 10, { width: 135, align: "right" });
    y += 38;
    for (const item of certificate.by_type) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(copy.labels[item.tax_type] || item.tax_type, 62, y);
        doc.font("Helvetica").fillColor(muted).text(String(item.documents), 280, y, { width: 80, align: "right" });
        doc.font("Helvetica-Bold").fillColor(teal).text(money(item.net), 395, y, { width: 135, align: "right" });
        y += 25;
        doc.moveTo(50, y - 8).lineTo(545, y - 8).strokeColor(line).stroke();
    }
    doc.roundedRect(315, y + 12, 230, 58, 8).fill("#0E302E");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#9FE7E5").text(copy.total, 330, y + 27);
    doc.fontSize(17).fillColor("#FFFFFF").text(money(certificate.totals.net), 330, y + 41, { width: 200, align: "right" });

    doc.font("Helvetica").fontSize(8).fillColor(muted).text(copy.notice, 50, 690, { width: 495, align: "center" });
    doc.text(`${copy.generated}: ${new Date(certificate.generated_at).toLocaleString(locale)}`, 50, 724, { width: 495, align: "center" });
    doc.end();
};
