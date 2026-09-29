import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/api";
import { formatCurrency } from "./currency";

// Ticket printing for the Caja. Prints through a hidden iframe with @page
// sized to the roll (58/80 mm) - thermal printers are driven by the OS
// driver, so any printer the browser can see works, no plugin needed.

const SETTINGS_KEY = "ohnix.pos.printSettings";
const HEADER_KEY = "ohnix.pos.receiptHeader";

export const readPrintSettings = () => {
    try {
        return { width: 80, autoPrint: false, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch {
        return { width: 80, autoPrint: false };
    }
};

export const writePrintSettings = (settings) => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Per-device convenience only.
    }
};

// Company header seen on the last online receipt - lets an offline sale
// still print with the business name/NIT on top.
const rememberHeader = (company) => {
    try {
        localStorage.setItem(HEADER_KEY, JSON.stringify(company));
    } catch {
        // ignore
    }
};
const cachedHeader = () => {
    try {
        return JSON.parse(localStorage.getItem(HEADER_KEY)) || null;
    } catch {
        return null;
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A sale's invoice is issued asynchronously right after checkout - give it a
// few seconds to come back accepted so the ticket can carry the CUFE/QR.
export const fetchReceipt = async (orderId, { waitForInvoiceMs = 0 } = {}) => {
    const started = Date.now();
    for (;;) {
        const response = await api.get(`/orders/${orderId}/receipt`);
        const receipt = response.data?.data;
        rememberHeader(receipt.company);
        const waiting = receipt.document?.kind === "in_process" && ["issuing", "submitted", "draft"].includes(receipt.document.status);
        if (!waiting || Date.now() - started >= waitForInvoiceMs) return receipt;
        await sleep(1500);
    }
};

// Offline (or not yet synced) sale: built from what the Caja has locally.
export const buildLocalReceipt = ({ lines, totals, customer, payments, pointOfSale, cashier, number }) => ({
    company: cachedHeader() || { name: "" },
    sale: { number: number || null, date: new Date().toISOString(), point_of_sale: pointOfSale || null, cashier: cashier || null },
    customer: {
        name: customer?.type === "final_consumer" ? null : customer?.name,
        is_final_consumer: customer?.type === "final_consumer",
        identification: customer?.identification || null,
    },
    lines: lines.map((l) => ({
        name: l.product.product_name,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        total: l.quantity * l.unitPrice,
    })),
    totals: { subtotal: totals.subTotal, tax: totals.gst, total: totals.total },
    payments: payments || [],
    document: { kind: "offline" },
});

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (value) => formatCurrency(value, "COP");

const renderHtml = (receipt, { width, t, received, change }) => {
    const { company, sale, customer, lines, totals, payments, document: doc } = receipt;
    const date = new Date(sale.date);
    const qr = doc.kind === "electronic_invoice" && doc.qr_url ? renderToStaticMarkup(createElement(QRCodeSVG, { value: doc.qr_url, size: width === 58 ? 120 : 150, level: "M" })) : "";

    let docTitle;
    let docNote = "";
    if (doc.kind === "electronic_invoice") {
        docTitle = `${t("receipt.einvoice")} ${esc(doc.number || "")}`;
    } else if (doc.kind === "pre_bill") {
        docTitle = t("receipt.pre_bill");
        docNote = t("receipt.note_pre_bill");
    } else {
        docTitle = t("receipt.sale_receipt");
        docNote =
            doc.kind === "deferred"
                ? t("receipt.note_deferred")
                : doc.kind === "offline"
                  ? t("receipt.note_offline")
                  : doc.kind === "in_process"
                    ? t("receipt.note_in_process")
                    : "";
    }

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.number || "ticket")}</title>
<style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 3mm ${width === 58 ? "2mm" : "4mm"}; width: ${width}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${width === 58 ? "10px" : "11.5px"}; color: #000; }
.c { text-align: center; } .b { font-weight: 700; } .s { font-size: 0.85em; }
.hr { border-top: 1px dashed #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span:last-child { text-align: right; white-space: nowrap; }
.item { margin: 3px 0; }
.big { font-size: 1.35em; }
img.logo { max-width: 60%; max-height: 18mm; margin: 0 auto 4px; display: block; }
.qr { display: flex; justify-content: center; margin: 6px 0; }
.cufe { word-break: break-all; font-size: 0.75em; }
</style></head><body>
${company.logo_url ? `<img class="logo" src="${esc(company.logo_url)}" onerror="this.remove()">` : ""}
<div class="c b">${esc(company.name)}</div>
${company.trade_name ? `<div class="c">${esc(company.trade_name)}</div>` : ""}
${company.nit ? `<div class="c">NIT ${esc(company.nit)}</div>` : ""}
${company.nit ? `<div class="c s">${company.vat_responsible ? t("receipt.vat_responsible") : t("receipt.vat_not_responsible")}</div>` : ""}
${company.phone ? `<div class="c s">${t("receipt.phone")} ${esc(company.phone)}</div>` : ""}
<div class="hr"></div>
<div class="c b">${docTitle}</div>
${sale.number ? `<div class="row"><span>${t("receipt.sale")}</span><span>${esc(sale.number)}</span></div>` : ""}
<div class="row"><span>${t("receipt.date")}</span><span>${date.toLocaleDateString("es-CO")} ${date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span></div>
${sale.point_of_sale ? `<div class="row"><span>${t("receipt.point_of_sale")}</span><span>${esc(sale.point_of_sale)}</span></div>` : ""}
${sale.table ? `<div class="row"><span>${t("receipt.table")}</span><span>${esc(sale.table)}</span></div>` : ""}
${sale.cashier ? `<div class="row"><span>${t("receipt.cashier")}</span><span>${esc(sale.cashier)}</span></div>` : ""}
<div class="row"><span>${t("receipt.customer")}</span><span>${customer.is_final_consumer || !customer.name ? t("receipt.final_consumer") : esc(customer.name)}</span></div>
${customer.identification ? `<div class="row"><span>${t("receipt.id")}</span><span>${esc(customer.identification)}</span></div>` : ""}
<div class="hr"></div>
${lines
    .map(
        (l) => `<div class="item"><div>${esc(l.name)}</div><div class="row s"><span>${l.quantity} x ${money(l.unit_price)}</span><span>${money(l.total)}</span></div></div>`
    )
    .join("")}
<div class="hr"></div>
<div class="row"><span>${t("receipt.subtotal")}</span><span>${money(totals.subtotal)}</span></div>
<div class="row"><span>${t("receipt.tax")}</span><span>${money(totals.tax)}</span></div>
<div class="row b big"><span>${t("receipt.total")}</span><span>${money(totals.total)}</span></div>
${payments.length ? `<div class="hr"></div>${payments.map((p) => `<div class="row"><span>${esc(p.method || t("receipt.payment"))}${p.reference ? ` · ${esc(p.reference)}` : ""}</span><span>${money(p.amount)}</span></div>`).join("")}` : ""}
${received ? `<div class="row"><span>${t("receipt.received")}</span><span>${money(received)}</span></div>` : ""}
${change > 0 ? `<div class="row b"><span>${t("receipt.change")}</span><span>${money(change)}</span></div>` : ""}
${doc.kind === "electronic_invoice" ? `<div class="hr"></div><div class="c s">${t("receipt.cufe")}</div><div class="c cufe">${esc(doc.cufe || "")}</div>${qr ? `<div class="qr">${qr}</div>` : ""}` : ""}
${docNote ? `<div class="hr"></div><div class="c s">${docNote}</div>` : ""}
${company.footer ? `<div class="hr"></div><div class="c s">${esc(company.footer)}</div>` : ""}
<div class="c s" style="margin-top:8px">${t("receipt.thanks")}</div>
<div class="c s">Ohnix</div>
</body></html>`;
};

// Pre-cuenta: what the table owes so far, clearly NOT a sale document.
export const buildPreBill = ({ tab, lines, totals, pointOfSale, cashier }) => ({
    ...buildLocalReceipt({ lines, totals, customer: null, payments: [], pointOfSale, cashier }),
    sale: { number: null, date: new Date().toISOString(), point_of_sale: pointOfSale || null, cashier: cashier || null, table: tab.table_name },
    document: { kind: "pre_bill" },
});

const renderKitchenHtml = ({ tableName, guests, waiter, items, width, t }) => {
    const now = new Date();
    return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title>
<style>
@page { size: ${width}mm auto; margin: 0; }
body { margin: 0; padding: 3mm ${width === 58 ? "2mm" : "4mm"}; width: ${width}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${width === 58 ? "12px" : "14px"}; color: #000; }
.c { text-align: center; } .b { font-weight: 700; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
.item { display: flex; gap: 8px; margin: 5px 0; font-size: 1.15em; } .qty { font-weight: 700; min-width: 2.5em; }
.note { font-size: 0.85em; padding-left: 2.8em; }
</style></head><body>
<div class="c b" style="font-size:1.3em">${t("receipt.kitchen_ticket")}</div>
<div class="c b" style="font-size:1.6em">${esc(tableName)}</div>
<div class="c">${now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}${guests ? ` · ${guests} ${t("receipt.guests")}` : ""}${waiter ? ` · ${esc(waiter)}` : ""}</div>
<div class="hr"></div>
${items.map((i) => `<div class="item"><span class="qty">${i.quantity}x</span><span>${esc(i.product_name)}</span></div>${i.note ? `<div class="note">→ ${esc(i.note)}</div>` : ""}`).join("")}
<div class="hr"></div>
</body></html>`;
};

const printHtml = (html) =>
    new Promise((resolve) => {
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            setTimeout(() => frame.remove(), 500);
            resolve();
        };
        setTimeout(() => {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.onafterprint = cleanup;
                frame.contentWindow.print();
            } finally {
                setTimeout(cleanup, 60000);
            }
        }, 350);
    });

export const printKitchenTicket = ({ tableName, guests, waiter, items, width = 80, t }) =>
    printHtml(renderKitchenHtml({ tableName, guests, waiter, items, width, t }));

export const printReceipt = (receipt, { width = 80, t, received, change } = {}) => printHtml(renderHtml(receipt, { width, t, received, change }));
