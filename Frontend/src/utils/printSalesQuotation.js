const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

export const printSalesQuotation = ({ quotation, company, currentLanguage = "es", formatCurrency }) => {
    const isEnglish = currentLanguage === "en";
    const companyName = company?.legalName || company?.name || "Ohnix";
    const companyContact = [company?.contactEmail, company?.phone].filter(Boolean).join(" · ");
    const text = isEnglish
        ? { title: "Sales quotation", customer: "Customer", issued: "Issued", valid: "Valid until", product: "Product", quantity: "Quantity", price: "Selling price", total: "Total", notes: "Notes", subtotal: "Subtotal", discount: "Discount", tax: "Tax", grandTotal: "Total" }
        : { title: "Cotización para cliente", customer: "Cliente", issued: "Emitida", valid: "Válida hasta", product: "Producto", quantity: "Cantidad", price: "Precio de venta", total: "Total", notes: "Notas y condiciones", subtotal: "Subtotal", discount: "Descuento", tax: "Impuestos", grandTotal: "Total" };
    const date = (value) => value ? new Date(value).toLocaleDateString(isEnglish ? "en-US" : "es-CO") : "-";
    const money = (value) => formatCurrency(Number(value || 0));
    const rows = (quotation.details || []).map((detail) => `
        <tr><td>${escapeHtml(detail.product_id?.product_name || "-")}</td><td>${escapeHtml(detail.quantity)}</td><td>${escapeHtml(money(detail.unit_price))}</td><td>${escapeHtml(money(detail.line_total))}</td></tr>`).join("");
    const html = `<!doctype html><html lang="${isEnglish ? "en" : "es"}"><head><meta charset="utf-8"><title>${escapeHtml(text.title)} #${escapeHtml(quotation.quotation_no)}</title><style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#15232a;max-width:820px;margin:0 auto;padding:42px}.brand{color:#0b9997;font-size:12px;letter-spacing:.22em;font-weight:700}.header{display:flex;justify-content:space-between;border-bottom:2px solid #29d8d5;padding-bottom:18px;margin-bottom:28px}.title{font-size:26px;font-weight:700;margin:8px 0}.meta{text-align:right;color:#60717a;font-size:13px;line-height:1.8}.customer{border:1px solid #dce5e8;border-radius:10px;padding:14px;margin-bottom:26px}.label{color:#71818a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #e5ecee;font-size:13px}th{color:#60717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.numbers{margin:24px 0 0 auto;width:270px}.numbers div{display:flex;justify-content:space-between;padding:5px 0;color:#60717a}.numbers .grand{border-top:2px solid #29d8d5;margin-top:7px;padding-top:10px;color:#15232a;font-size:18px;font-weight:700}.notes{margin-top:30px;padding-top:16px;border-top:1px solid #dce5e8;white-space:pre-wrap;color:#4d5f68;font-size:13px}@media print{body{padding:0}}
    .footer{margin-top:36px;padding-top:10px;border-top:1px solid #eef2f3;color:#a4b0b6;font-size:10px;text-align:right}
    </style></head><body><div class="header"><div><div class="brand">${escapeHtml(companyName)}</div><div class="title">${escapeHtml(text.title)}</div><div>#${escapeHtml(quotation.quotation_no)}</div></div><div class="meta">${text.issued}: ${date(quotation.issued_at)}<br>${text.valid}: ${date(quotation.valid_until)}${companyContact ? `<br>${escapeHtml(companyContact)}` : ""}</div></div><div class="customer"><div class="label">${text.customer}</div><strong>${escapeHtml(quotation.customer?.name || "-")}</strong><br>${escapeHtml(quotation.customer?.email || "")} ${quotation.customer?.phone ? `· ${escapeHtml(quotation.customer.phone)}` : ""}</div><table><thead><tr><th>${text.product}</th><th>${text.quantity}</th><th>${text.price}</th><th>${text.total}</th></tr></thead><tbody>${rows}</tbody></table><div class="numbers"><div><span>${text.subtotal}</span><strong>${money(quotation.subtotal)}</strong></div><div><span>${text.discount}</span><strong>${money(quotation.discount)}</strong></div><div><span>${text.tax}</span><strong>${money(quotation.tax)}</strong></div><div class="grand"><span>${text.grandTotal}</span><strong>${money(quotation.total)}</strong></div></div>${quotation.notes ? `<div class="notes"><div class="label">${text.notes}</div>${escapeHtml(quotation.notes)}</div>` : ""}<div class="footer">${isEnglish ? "Generated via Ohnix" : "Generado vía Ohnix"}</div></body></html>`;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    setTimeout(() => printWindow.print(), 250);
};
