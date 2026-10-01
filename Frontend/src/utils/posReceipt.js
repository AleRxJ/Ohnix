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
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { background: #fff; }
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

// Kitchen ticket ("comanda"): what a line cook needs at a glance - big
// table name, which round this is (an ADICIONAL for a table already served
// must stand out), quantities and notes impossible to misread, and who/when.
const renderKitchenHtml = ({ companyName, tableName, zone, guests, waiter, items, round = 1, tabCode, openedAt, width, t }) => {
    const now = new Date();
    const narrow = width === 58;
    const time = (d) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    const units = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const minutesOpen = openedAt ? Math.max(0, Math.round((now - new Date(openedAt)) / 60000)) : null;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title>
<style>
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { background: #fff; }
body { margin: 0; padding: 3mm ${narrow ? "2mm" : "3.5mm"} 4mm; width: ${width}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${narrow ? "11px" : "12.5px"}; color: #000; line-height: 1.25; }
.c { text-align: center; } .b { font-weight: 700; } .up { text-transform: uppercase; }
.biz { font-size: 0.9em; letter-spacing: 0.04em; }
.tag { background: #000; color: #fff; font-weight: 700; letter-spacing: 0.25em; padding: 3px 0; margin: 4px 0 6px; font-size: 1.15em; }
.table { font-size: ${narrow ? "2.1em" : "2.6em"}; font-weight: 700; line-height: 1.05; }
.zone { font-size: 1em; margin-top: 2px; }
.round { border: 2px solid #000; font-weight: 700; padding: 3px 0; margin: 6px 0; font-size: 1.1em; letter-spacing: 0.08em; }
.meta { display: flex; justify-content: space-between; gap: 6px; margin: 1px 0; }
.hr { border-top: 1px dashed #000; margin: 6px 0; }
.hr2 { border-top: 2px solid #000; margin: 6px 0; }
.head { display: flex; gap: 6px; font-weight: 700; font-size: 0.85em; }
.head .qty { min-width: 2.9em; }
.item { display: flex; gap: 6px; margin: 6px 0 2px; font-size: ${narrow ? "1.2em" : "1.35em"}; font-weight: 700; }
.qty { min-width: 2.4em; }
.name { flex: 1; text-transform: uppercase; word-break: break-word; }
.note { margin: 0 0 4px 2.6em; font-size: ${narrow ? "1em" : "1.1em"}; font-style: italic; border-left: 3px solid #000; padding-left: 5px; }
.foot { font-size: 0.9em; }
.cut { text-align: center; letter-spacing: 0.3em; margin-top: 8px; font-size: 0.9em; }
</style></head><body>
${companyName ? `<div class="c biz up">${esc(companyName)}</div>` : ""}
<div class="c tag">${t("receipt.kitchen_ticket")}</div>
<div class="c table">${esc(tableName)}</div>
${zone ? `<div class="c zone up">${esc(zone)}</div>` : ""}
${round > 1 ? `<div class="c round up">${t("receipt.kitchen_additional")} · ${t("receipt.kitchen_round", { round })}</div>` : ""}
<div class="hr"></div>
${tabCode ? `<div class="meta"><span>${t("receipt.kitchen_order_no")}</span><span class="b">#${esc(tabCode)}${round > 1 ? `-${round}` : ""}</span></div>` : ""}
<div class="meta"><span>${t("receipt.date")}</span><span>${now.toLocaleDateString("es-CO")}</span></div>
<div class="meta"><span>${t("receipt.kitchen_time")}</span><span class="b">${time(now)}</span></div>
${waiter ? `<div class="meta"><span>${t("receipt.kitchen_waiter")}</span><span>${esc(waiter)}</span></div>` : ""}
${guests ? `<div class="meta"><span>${t("receipt.kitchen_guests")}</span><span>${guests}</span></div>` : ""}
${minutesOpen !== null && round > 1 ? `<div class="meta"><span>${t("receipt.kitchen_opened")}</span><span>${minutesOpen} min</span></div>` : ""}
<div class="hr2"></div>
<div class="head"><span class="qty">${t("receipt.kitchen_qty")}</span><span>${t("receipt.kitchen_item")}</span></div>
${items
    .map(
        (i) =>
            `<div class="item"><span class="qty">${i.quantity}</span><span class="name">${esc(i.product_name)}</span></div>${i.note ? `<div class="note">» ${esc(i.note)}</div>` : ""}`
    )
    .join("")}
<div class="hr2"></div>
<div class="meta foot b"><span>${t("receipt.kitchen_total")}</span><span>${units} ${t("receipt.kitchen_units")}</span></div>
<div class="c foot">${t("receipt.kitchen_sent_at", { time: time(now) })}</div>
<div class="cut">- - - - - - - - - - - -</div>
</body></html>`;
};

const printHtml = (html, widthMm = 80) =>
    new Promise((resolve) => {
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        // Off-screen but at the real roll width, so the content lays out (and
        // measures) exactly as it will print.
        Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: `${widthMm}mm`, height: "200px", border: "0", visibility: "hidden" });
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
                const heightPx = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
                const heightMm = Math.ceil((heightPx * 25.4) / 96) + 4;
                const pageStyle = doc.createElement("style");
                pageStyle.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
                doc.head.appendChild(pageStyle);
                frame.contentWindow.focus();
                frame.contentWindow.onafterprint = cleanup;
                frame.contentWindow.print();
            } finally {
                setTimeout(cleanup, 60000);
            }
        }, 350);
    });

export const printKitchenTicket = ({ companyName, tableName, zone, guests, waiter, items, round, tabCode, openedAt, width = 80, t }) =>
    printHtml(renderKitchenHtml({ companyName: companyName || cachedHeader()?.name, tableName, zone, guests, waiter, items, round, tabCode, openedAt, width, t }), width);

export const printReceipt = (receipt, { width = 80, t, received, change } = {}) => printHtml(renderHtml(receipt, { width, t, received, change }), width);

// Test/preview hook: the exact HTML that gets printed (used to render a PNG
// preview without a printer).
export const renderKitchenTicketHtml = (args) => renderKitchenHtml({ width: 80, ...args });
