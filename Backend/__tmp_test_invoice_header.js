const PDFDocument = require("pdfkit");
const fs = require("fs");

function renderHeader(invoiceNo, outPath) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(fs.createWriteStream(outPath));

  const heroColor = "#0B0F19";
  const heroColorDeep = "#0E2624";
  const mutedOnDark = "#9AA5B1";
  const tealBright = "#29D8D5";
  const tealLight = "#44F3F0";
  const PAGE_RIGHT = 545;

  const HERO_HEIGHT = 158;
  const heroGrad = doc.linearGradient(0, 0, 595, HERO_HEIGHT);
  heroGrad.stop(0, heroColor).stop(1, heroColorDeep);
  doc.rect(0, 0, 595, HERO_HEIGHT).fill(heroGrad);

  const status = { label: "COMPLETADO", bg: "#ECFDF5", fg: "#047857" };

  doc.fontSize(9)
    .fillColor(tealBright)
    .font("Helvetica-Bold")
    .text("FACTURA", 330, 46, { width: 215, align: "right", characterSpacing: 1.5 });

  const invoiceLabel = `#${invoiceNo}`;
  const invoiceBoxWidth = 215;
  const MAX_INVOICE_FONT_SIZE = 26;
  const MIN_INVOICE_FONT_SIZE = 11;
  doc.font("Helvetica-Bold");
  let invoiceFontSize = MAX_INVOICE_FONT_SIZE;
  while (
    invoiceFontSize > MIN_INVOICE_FONT_SIZE &&
    doc.fontSize(invoiceFontSize).widthOfString(invoiceLabel) > invoiceBoxWidth
  ) {
    invoiceFontSize -= 1;
  }
  doc.fontSize(invoiceFontSize).fillColor("#FFFFFF");
  const invoiceTextY = 61;
  doc.text(invoiceLabel, 330, invoiceTextY, {
    width: invoiceBoxWidth,
    align: "right",
    ellipsis: true,
    lineBreak: false,
  });

  doc.font("Helvetica-Bold").fontSize(8);
  const pillTextWidth = doc.widthOfString(status.label);
  const pillWidth = pillTextWidth + 18;
  const pillX = PAGE_RIGHT - pillWidth;
  const pillY = invoiceTextY + invoiceFontSize + 6;
  doc.roundedRect(pillX, pillY, pillWidth, 16, 8).fill(status.bg);
  doc.fillColor(status.fg).text(status.label, pillX, pillY + 4, { width: pillWidth, align: "center" });

  doc.fontSize(9)
    .fillColor(mutedOnDark)
    .font("Helvetica")
    .text(`Emitida el 18 de julio de 2026`, 330, pillY + 24, { width: invoiceBoxWidth, align: "right" });

  doc.end();
}

renderHeader("DEMO-CROSSFACTOR-ohnix-regular-13-4788483384368366", "/private/tmp/claude-502/-Users-alejando-vallejo-Documents-GitHub-Ohnix/762292f0-5fe9-4afc-ab74-1c24d211cd89/scratchpad/test_long.pdf");
renderHeader("2026-000123", "/private/tmp/claude-502/-Users-alejando-vallejo-Documents-GitHub-Ohnix/762292f0-5fe9-4afc-ab74-1c24d211cd89/scratchpad/test_short.pdf");
console.log("done");
