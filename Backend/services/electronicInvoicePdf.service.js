import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { getItcycleDianReadiness } from "./itcycleDian.service.js";
import { buildItcycleLines, buildItcycleTotals } from "./electronicInvoicing.service.js";

// DIAN's own catalog verification URLs - production vs habilitación (sandbox).
// Ohnix doesn't store dianConfiguration.environment locally (that lives only
// in itcycle-api-dian's own DB), but Company.itcycleTestSetId is exactly the
// signal for "still in habilitación" (see buildItcycleSendOptions in
// electronicInvoicing.service.js) - null once DIAN approves the software, at
// which point this naturally switches to the production catalog too.
const DIAN_CATALOG_PRODUCTION = "https://catalogo-vpfe.dian.gov.co/";
const DIAN_CATALOG_SANDBOX = "https://catalogo-vpfe-hab.dian.gov.co/";

const truncate2 = (value) => {
    const truncated = Math.trunc(Number(value) * 100) / 100;
    return truncated.toFixed(2);
};

// Mirrors dian-engine's formatDate/formatTime exactly (packages/core/src/
// utils/amount.ts) - DIAN's QR content format is fixed, not something to
// improvise a "close enough" version of.
const formatDianDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};
const formatDianTime = (date) => {
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${s}-05:00`;
};

const CUFE_DOCUMENT_TYPE = "01"; // Only invoices (facturas) reach this PDF today - notes/support docs use CUDE, not built here yet.

// Reconstructs the exact QR content string DIAN's Anexo Tecnico requires,
// entirely from data Ohnix already has (order/customer/company + the
// already-persisted invoice.cufe/invoiceNumber) - no second call to
// itcycle-api-dian needed for this part. Field order/format mirrors
// dian-engine's buildQRCode (xml/builder.ts) so a real DIAN QR scanner reads
// the same values either way.
export const buildElectronicInvoiceQrContent = ({ order, invoice, company }) => {
    const lines = buildItcycleLines(order.orderDetails);
    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);
    const sumByCode = (code) =>
        taxTotals.filter((t) => t.subtotals.some((s) => s.taxScheme.code === code)).reduce((sum, t) => sum + t.taxAmount, 0);
    const valIva = sumByCode("01");
    const valOtroIm = sumByCode("04") + sumByCode("03"); // INC + ICA

    const issuedAt = invoice.issuedAt || invoice.createdAt;
    const catalogBase = company.itcycleTestSetId ? DIAN_CATALOG_SANDBOX : DIAN_CATALOG_PRODUCTION;

    return [
        `NumFac: ${invoice.invoiceNumber}`,
        `FecFac: ${formatDianDate(issuedAt)}`,
        `HorFac: ${formatDianTime(issuedAt)}`,
        `NitFac: ${company.taxIdentification}`,
        `DocAdq: ${order.customer.identification}`,
        `ValFac: ${truncate2(legalMonetaryTotal.lineExtensionAmount)}`,
        `ValIva: ${truncate2(valIva)}`,
        `ValOtroIm: ${truncate2(valOtroIm)}`,
        `ValTotFac: ${truncate2(legalMonetaryTotal.taxInclusiveAmount)}`,
        `CUFE: ${invoice.cufe}`,
        `${catalogBase}document/searchqr?documentkey=${invoice.cufe}`,
    ].join("\n");
};

// Best-effort: the authorized numbering resolution (prefix/range/dates) that
// DIAN's own representación gráfica legend requires lives only in
// itcycle-api-dian's own database (Company on Ohnix's side never mirrors
// it), so this is a live cross-service call at render time - same pattern
// order.controller.js already uses for company.logoUrl. A transient
// itcycle-api-dian failure degrades to an omitted legend line, not a failed
// PDF - the invoice/CUFE/QR are already fully known locally regardless.
const loadResolutionLegend = async (company) => {
    if (!company.itcycleCompanyId) return null;
    try {
        const readiness = await getItcycleDianReadiness({ companyId: company.itcycleCompanyId });
        const resolution = (readiness?.resolutions || []).find((r) => r.documentType === CUFE_DOCUMENT_TYPE);
        if (!resolution) return null;
        const formatDate = (value) => new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
        return `Autorización de numeración DIAN No. ${resolution.resolutionNumber} de ${formatDate(resolution.startDate)}, prefijo ${resolution.prefix}, rango ${resolution.startNumber} a ${resolution.endNumber}, vigente hasta ${formatDate(resolution.endDate)}.`;
    } catch {
        return null;
    }
};

/**
 * Streams the DIAN "representación gráfica" PDF for an itcycle-issued
 * electronic invoice directly to the HTTP response - same on-demand,
 * no-storage pattern as order.controller.js's generic order-invoice PDF
 * (reused branding fields, reused visual language), plus the elements DIAN
 * actually requires that a generic receipt doesn't carry: CUFE, the QR
 * verification code, and the authorized numbering resolution legend.
 */
export const renderElectronicInvoicePdf = async (res, { order, invoice, company }) => {
    const qrContent = buildElectronicInvoiceQrContent({ order, invoice, company });
    const qrImageBuffer = await QRCode.toBuffer(qrContent, { margin: 1, width: 220 });
    const resolutionLegend = await loadResolutionLegend(company);

    const lines = buildItcycleLines(order.orderDetails);
    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);
    const isTest = Boolean(company.itcycleTestSetId);

    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=factura-electronica-${invoice.invoiceNumber}.pdf`);
    doc.pipe(res);

    const inkColor = "#0B0F19";
    const mutedColor = "#6B7280";
    const mutedOnDark = "#9AA5B1";
    const lineColor = "#EAECF0";
    const tealBright = "#29D8D5";
    const tealLight = "#44F3F0";
    const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || "");
    const inkTeal = isValidHexColor(company.pdfAccentColor) ? company.pdfAccentColor : "#0B7A78";
    const PAGE_LEFT = 50;
    const PAGE_RIGHT = 545;
    const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

    const hairline = (y, color = lineColor, weight = 1) => {
        doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).strokeColor(color).lineWidth(weight).stroke();
    };

    // --- Hero band -------------------------------------------------------
    const HERO_HEIGHT = 130;
    const heroGrad = doc.linearGradient(0, 0, 595, HERO_HEIGHT);
    heroGrad.stop(0, "#0B0F19").stop(1, "#0E2624");
    doc.rect(0, 0, 595, HERO_HEIGHT).fill(heroGrad);

    let logoBuffer = null;
    if (company.logoUrl) {
        try {
            const logoResponse = await fetch(company.logoUrl);
            if (logoResponse.ok) logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
        } catch {
            // Falls back to text-only header below.
        }
    }
    const hasLogo = Boolean(logoBuffer);
    const textX = hasLogo ? 108 : PAGE_LEFT;
    if (hasLogo) {
        doc.roundedRect(PAGE_LEFT, 24, 84, 56, 8).fill("#FFFFFF");
        try {
            doc.image(logoBuffer, PAGE_LEFT + 7, 31, { fit: [70, 42] });
        } catch {
            // Corrupt/unsupported image format - continue without it.
        }
    }
    doc.fontSize(16).fillColor("#FFFFFF").font("Helvetica-Bold").text(company.name, textX, 30, { width: 260 - (textX - PAGE_LEFT) });
    const legalLine = [company.legalName, `NIT ${company.taxIdentification}`, company.contactEmail].filter(Boolean).join("  ·  ");
    doc.fontSize(8).fillColor(mutedOnDark).font("Helvetica").text(legalLine, textX, 50, { width: 260 - (textX - PAGE_LEFT) });

    doc.fontSize(9).fillColor(tealBright).font("Helvetica-Bold").text("FACTURA ELECTRÓNICA DE VENTA", 320, 28, { width: 225, align: "right", characterSpacing: 0.8 });
    doc.fontSize(22).fillColor("#FFFFFF").font("Helvetica-Bold").text(`${invoice.invoiceNumber}`, 320, 44, { width: 225, align: "right" });
    doc.fontSize(7.5).fillColor(mutedOnDark).font("Helvetica").text("CUFE", 320, 70, { width: 225, align: "right" });
    doc.fontSize(7).fillColor(mutedOnDark).font("Helvetica").text(invoice.cufe, 320, 80, { width: 225, align: "right" });

    if (isTest) {
        doc.fontSize(8).fillColor("#F59E0B").font("Helvetica-Bold").text("DOCUMENTO DE PRUEBA - HABILITACIÓN DIAN, SIN VALIDEZ FISCAL", 320, 104, { width: 225, align: "right" });
    }

    const seamGrad = doc.linearGradient(0, HERO_HEIGHT - 3, 595, HERO_HEIGHT);
    seamGrad.stop(0, tealBright).stop(1, tealLight);
    doc.rect(0, HERO_HEIGHT - 3, 595, 3).fill(seamGrad);

    // --- Bill-to / issue-date grid ----------------------------------------
    const infoY = HERO_HEIGHT + 22;
    const eyebrow = (text, x, y, width) => doc.fontSize(8.5).fillColor(mutedColor).font("Helvetica-Bold").text(text, x, y, { width, characterSpacing: 0.6 });

    eyebrow("FACTURAR A", PAGE_LEFT, infoY, 260);
    doc.fontSize(12).fillColor(inkColor).font("Helvetica-Bold").text(order.customer.name, PAGE_LEFT, infoY + 15, { width: 260 });
    doc.fontSize(9).fillColor(mutedColor).font("Helvetica")
        .text(`${order.customer.identificationDocumentCode === "31" ? "NIT" : "C.C."} ${order.customer.identification}`, PAGE_LEFT, infoY + 32, { width: 260 })
        .text(order.customer.address || "", PAGE_LEFT, doc.y + 2, { width: 260 });

    const detailX = 330;
    eyebrow("FECHA DE EMISIÓN", detailX, infoY, 215);
    const issuedAt = invoice.issuedAt || invoice.createdAt;
    doc.fontSize(10).fillColor(inkColor).font("Helvetica").text(new Date(issuedAt).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" }), detailX, infoY + 15, { width: 215 });

    // --- Line items --------------------------------------------------------
    const tableTop = 230;
    doc.fontSize(8.5).fillColor(inkTeal).font("Helvetica-Bold")
        .text("PRODUCTO", PAGE_LEFT, tableTop, { characterSpacing: 0.5 })
        .text("CANT.", 300, tableTop, { width: 40, align: "center", characterSpacing: 0.5 })
        .text("PRECIO", 350, tableTop, { width: 75, align: "right", characterSpacing: 0.5 })
        .text("IVA", 430, tableTop, { width: 45, align: "right", characterSpacing: 0.5 })
        .text("IMPORTE", 480, tableTop, { width: 65, align: "right", characterSpacing: 0.5 });
    hairline(tableTop + 16, inkTeal, 1.5);

    let rowY = tableTop + 26;
    for (const item of order.orderDetails) {
        const quantity = Number(item.quantity);
        const unitcost = Number(item.unitcost);
        doc.fontSize(9.5).fillColor(inkColor).font("Helvetica-Bold").text(item.product.productName, PAGE_LEFT, rowY, { width: 240 });
        doc.fontSize(9.5).fillColor(mutedColor).font("Helvetica")
            .text(String(quantity), 300, rowY, { width: 40, align: "center" })
            .text(`$${unitcost.toFixed(2)}`, 350, rowY, { width: 75, align: "right" })
            .text(item.taxTreatmentApplied === "excluded" ? "Excluido" : `${Number(item.taxRateApplied)}%`, 430, rowY, { width: 45, align: "right" });
        doc.fillColor(inkColor).font("Helvetica-Bold").text(`$${(quantity * unitcost).toFixed(2)}`, 480, rowY, { width: 65, align: "right" });
        rowY += 24;
        hairline(rowY - 8, lineColor, 0.75);
    }

    // --- Totals + QR -------------------------------------------------------
    let summaryY = rowY + 10;
    doc.image(qrImageBuffer, PAGE_LEFT, summaryY, { fit: [110, 110] });
    doc.fontSize(7).fillColor(mutedColor).font("Helvetica").text("Verifique este documento en el catálogo de la DIAN", PAGE_LEFT, summaryY + 112, { width: 110, align: "center" });

    const totalsX = 330;
    const totalsWidth = PAGE_RIGHT - totalsX;
    doc.fontSize(9.5).fillColor(mutedColor).font("Helvetica")
        .text("Subtotal", totalsX, summaryY, { width: 100 })
        .text(`$${legalMonetaryTotal.lineExtensionAmount.toFixed(2)}`, totalsX, summaryY, { width: totalsWidth, align: "right" });
    let taxLineY = summaryY + 18;
    for (const taxTotal of taxTotals) {
        const rates = taxTotal.subtotals.map((s) => `${s.percent}%`).join("+");
        doc.text(`IVA (${rates})`, totalsX, taxLineY, { width: 100 }).text(`$${taxTotal.taxAmount.toFixed(2)}`, totalsX, taxLineY, { width: totalsWidth, align: "right" });
        taxLineY += 18;
    }

    const totalPanelY = taxLineY + 6;
    doc.roundedRect(totalsX, totalPanelY, totalsWidth, 56, 10).fill(inkColor);
    doc.fontSize(8.5).fillColor(mutedOnDark).font("Helvetica-Bold").text("TOTAL A PAGAR", totalsX + 16, totalPanelY + 12, { characterSpacing: 0.8 });
    doc.fontSize(21).fillColor(inkTeal).font("Helvetica-Bold").text(`$${legalMonetaryTotal.taxInclusiveAmount.toFixed(2)}`, totalsX, totalPanelY + 24, { width: totalsWidth - 16, align: "right" });

    // --- Legal footer --------------------------------------------------------
    const footerY = Math.max(totalPanelY + 80, summaryY + 145);
    hairline(footerY);
    if (resolutionLegend) {
        doc.fontSize(7.5).fillColor(mutedColor).font("Helvetica").text(resolutionLegend, PAGE_LEFT, footerY + 12, { width: PAGE_WIDTH, align: "center" });
    }
    doc.fontSize(7.5).fillColor(mutedColor).font("Helvetica")
        .text("Esta es una representación gráfica de la factura electrónica de venta. Documento generado por Ohnix (software propio de facturación electrónica).", PAGE_LEFT, doc.y + 6, { width: PAGE_WIDTH, align: "center" });

    const pageCount = doc.bufferedPageCount;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(mutedColor).text(`Página ${i + 1} de ${pageCount}`, PAGE_LEFT, 770, { align: "center", width: PAGE_WIDTH });
    }

    doc.end();
};
