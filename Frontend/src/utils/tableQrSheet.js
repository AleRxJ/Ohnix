import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

// Printable A4 sheet with one card per table: the QR a customer scans to see
// the menu and order from that table (public /m/:token). Ohnix look on paper:
// white card, cyan accent rule, Space Grotesk. Same hidden-iframe printing as
// the receipts (posReceipt.js), sized to A4 instead of the roll.

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const tableMenuUrl = (token) => `${window.location.origin}/m/${token}`;

const renderSheet = ({ restaurantName, tables, t }) => {
    const cards = tables
        .map((table) => {
            const qr = renderToStaticMarkup(createElement(QRCodeSVG, { value: tableMenuUrl(table.public_token), size: 168, level: "M", marginSize: 0 }));
            return `<div class="card">
  <div class="brand">${esc(restaurantName)}</div>
  <div class="table">${esc(table.name)}</div>
  ${table.zone ? `<div class="zone">${esc(table.zone)}</div>` : ""}
  <div class="qr">${qr}</div>
  <div class="cta">${esc(t("tables.qr_sheet_cta"))}</div>
  <div class="hint">${esc(t("tables.qr_sheet_hint"))}</div>
  <div class="foot">Ohnix</div>
</div>`;
        })
        .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>QR</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Space Grotesk", "Manrope", system-ui, sans-serif; color: #0b0b0b; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
.card { break-inside: avoid; border: 1.5px solid #d7dde0; border-radius: 6mm; padding: 7mm 6mm 5mm; text-align: center; position: relative; overflow: hidden; height: 128mm; display: flex; flex-direction: column; align-items: center; }
.card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 2.2mm; background: linear-gradient(90deg, #29d8d5, #44f3f0); }
.brand { font-size: 11pt; font-weight: 500; color: #5b676d; letter-spacing: .02em; }
.table { font-size: 26pt; font-weight: 700; line-height: 1.1; margin-top: 2mm; }
.zone { font-size: 10pt; color: #5b676d; margin-top: 1mm; }
.qr { margin: 6mm 0 4mm; padding: 4mm; border-radius: 4mm; border: 1px solid #e3e8ea; }
.qr svg { display: block; width: 52mm; height: 52mm; }
.cta { font-size: 13pt; font-weight: 700; }
.hint { font-size: 9pt; color: #5b676d; margin-top: 1mm; max-width: 70mm; }
.foot { margin-top: auto; font-size: 8pt; color: #9aa5ab; letter-spacing: .18em; text-transform: uppercase; }
</style></head><body><div class="grid">${cards}</div></body></html>`;
};

export const printTableQrSheet = ({ restaurantName, tables, t }) =>
    new Promise((resolve) => {
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm", border: "0", visibility: "hidden" });
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(renderSheet({ restaurantName, tables, t }));
        doc.close();
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            setTimeout(() => frame.remove(), 500);
            resolve();
        };
        // Give the web font a moment; printing falls back to system fonts otherwise.
        setTimeout(() => {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.onafterprint = cleanup;
                frame.contentWindow.print();
            } finally {
                setTimeout(cleanup, 60000);
            }
        }, 700);
    });
