import PDFDocument from "pdfkit";

const CONTENT_LEFT = 50;
const CONTENT_RIGHT = 550;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 22;
const PRIMARY = "#2c3e50";
const SUBTLE = "#7f8c8d";
const ACCENT = "#0ea5a2";
const STRIPE = "#f4f6f7";
const BORDER = "#d9d9d9";

const slugify = (value) =>
    (value || "report")
        .toString()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "report";

// Same PDFKit engine already used for order invoices (order.controller.js),
// reused here for a generic "N sections, each an optional heading + summary
// lines + table" layout - every report (stock/sales/purchases/top-products/
// advanced) already reduces down to that shape client-side for its CSV/Excel
// export (see each report component's buildReportRows), just split into
// `sections` here instead of one flat row array, since e.g. Sales has a
// "sales by date" table AND a "top products" table on one page. This
// renders the same data the user is looking at, branded, as an actual
// document instead of a raster print of the dashboard.
export const streamReportPdf = (res, { companyName, title, subtitle, generatedFor, sections = [] }) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(title)}.pdf"`);
    doc.pipe(res);

    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
    const ensureSpace = (needed) => {
        if (y + needed > bottomLimit()) {
            doc.addPage();
            y = doc.page.margins.top;
        }
    };

    doc.fontSize(18).fillColor(PRIMARY).font("Helvetica-Bold").text(companyName || "Ohnix", CONTENT_LEFT, 50);
    doc.moveTo(CONTENT_LEFT, 76).lineTo(CONTENT_RIGHT, 76).strokeColor(BORDER).lineWidth(0.5).stroke();

    doc.fontSize(15).fillColor(PRIMARY).font("Helvetica-Bold").text(title, CONTENT_LEFT, 90);
    if (subtitle) {
        doc.fontSize(9).fillColor(SUBTLE).font("Helvetica").text(subtitle, CONTENT_LEFT, 111, { width: CONTENT_RIGHT - CONTENT_LEFT });
    }
    const generatedLine = `Generado el ${new Date().toLocaleString("es-CO")}${generatedFor ? ` · ${generatedFor}` : ""}`;
    doc.fontSize(8).fillColor(SUBTLE).font("Helvetica").text(generatedLine, CONTENT_LEFT, subtitle ? 125 : 111);

    let y = subtitle ? 148 : 134;

    sections.forEach((section) => {
        const { heading, summary = [], table } = section || {};

        if (heading) {
            ensureSpace(20);
            doc.font("Helvetica-Bold").fontSize(11).fillColor(PRIMARY).text(heading, CONTENT_LEFT, y);
            y += 20;
        }

        if (summary.length) {
            summary.forEach(([label, value]) => {
                ensureSpace(15);
                doc.font("Helvetica").fontSize(9).fillColor(SUBTLE).text(`${label}:`, CONTENT_LEFT, y, { continued: true });
                doc.font("Helvetica-Bold").fillColor(PRIMARY).text(`  ${value}`);
                y += 15;
            });
            y += 8;
        }

        if (table?.headers?.length) {
            const columns = table.headers.length;
            const tableWidth = CONTENT_RIGHT - CONTENT_LEFT;
            const colWidth = tableWidth / columns;

            const drawHeaderRow = () => {
                doc.rect(CONTENT_LEFT, y, tableWidth, HEADER_HEIGHT).fill(ACCENT);
                doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
                table.headers.forEach((header, i) => {
                    doc.text(String(header ?? ""), CONTENT_LEFT + i * colWidth + 4, y + 7, {
                        width: colWidth - 8,
                        height: HEADER_HEIGHT - 8,
                        ellipsis: true,
                        lineBreak: false,
                    });
                });
                y += HEADER_HEIGHT;
            };

            ensureSpace(HEADER_HEIGHT + ROW_HEIGHT);
            drawHeaderRow();

            (table.rows || []).forEach((row, index) => {
                if (y + ROW_HEIGHT > bottomLimit()) {
                    doc.addPage();
                    y = doc.page.margins.top;
                    drawHeaderRow();
                }

                if (index % 2 === 1) {
                    doc.rect(CONTENT_LEFT, y, tableWidth, ROW_HEIGHT).fill(STRIPE);
                }

                doc.font("Helvetica").fontSize(8).fillColor(PRIMARY);
                row.forEach((cell, i) => {
                    doc.text(String(cell ?? ""), CONTENT_LEFT + i * colWidth + 4, y + 6, {
                        width: colWidth - 8,
                        height: ROW_HEIGHT - 8,
                        ellipsis: true,
                        lineBreak: false,
                    });
                });
                y += ROW_HEIGHT;
            });

            doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).strokeColor(BORDER).lineWidth(0.5).stroke();
            y += 18;
        }
    });

    doc.end();
};
