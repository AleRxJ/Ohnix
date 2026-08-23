// Opens a separate, light-themed, print-ready window for one StockTransfer -
// deliberately NOT `window.print()` on the existing dark modal. Ohnix's
// dark theme (translucent chip backgrounds, glow shadows, CSS custom
// properties) would print as an unreadable mess, and this needs to look
// like an actual paper document someone signs by hand (a "remisión de
// traslado" - a common physical handoff record between locations), not a
// screenshot of the app. Building it as a standalone HTML string sidesteps
// fighting the app's stylesheet entirely.
const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const formatDate = (value, language) =>
    value
        ? new Date(value).toLocaleString(language, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "—";

export const printTransferDocument = ({ transfer, product, companyName, t, currentLanguage }) => {
    const reference = (transfer._id || "").slice(-8).toUpperCase();
    const printedAt = formatDate(new Date().toISOString(), currentLanguage);

    const rows = [
        [t("products.transfer_status_requested"), transfer.requested_by?.username, transfer.requested_at],
        [t("products.transfer_status_approved"), transfer.approved_by?.username, transfer.approved_at],
        [t("products.transfer_status_in_transit"), transfer.sent_by?.username, transfer.sent_at],
        [t("products.transfer_status_received"), transfer.received_by?.username, transfer.received_at],
        [t("products.transfer_status_cancelled"), transfer.cancelled_by?.username, transfer.cancelled_at],
    ].filter(([, , at]) => at);

    const historyRows = rows
        .map(
            ([label, actor, at]) => `
        <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(actor || t("products.transfer_timeline_unknown_actor"))}</td>
            <td>${escapeHtml(formatDate(at, currentLanguage))}</td>
        </tr>`
        )
        .join("");

    const signatureBox = (roleLabel, actorName) => `
        <div class="sign-box">
            <div class="sign-line"></div>
            <div class="sign-role">${escapeHtml(roleLabel)}</div>
            <div class="sign-field"><span>${escapeHtml(t("printTransfer.name_label"))}:</span> ${escapeHtml(actorName || "")}</div>
            <div class="sign-field"><span>${escapeHtml(t("printTransfer.id_label"))}:</span> _____________________</div>
            <div class="sign-field"><span>${escapeHtml(t("printTransfer.date_label"))}:</span> _____________________</div>
        </div>`;

    const html = `<!doctype html>
<html lang="${escapeHtml(currentLanguage || "es")}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t("printTransfer.document_title"))} ${escapeHtml(reference)}</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 22px; }
    .company { font-size: 16px; font-weight: 700; }
    .doc-title { font-size: 20px; font-weight: 700; text-align: right; }
    .doc-ref { font-size: 12px; color: #555; text-align: right; }
    .route { display: flex; align-items: center; gap: 14px; font-size: 18px; font-weight: 700; margin: 22px 0 6px; }
    .arrow { color: #888; font-weight: 400; }
    .product-line { font-size: 13px; color: #444; margin-bottom: 18px; }
    .stats { display: flex; gap: 32px; margin: 18px 0; }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #777; }
    .stat-value { font-size: 18px; font-weight: 700; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #777; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .notes { font-size: 13px; color: #333; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
    th { color: #777; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    .signatures { display: flex; justify-content: space-between; gap: 40px; margin-top: 70px; }
    .sign-box { width: 100%; }
    .sign-line { border-top: 1px solid #111; margin-top: 55px; }
    .sign-role { font-size: 12px; font-weight: 700; margin-top: 6px; }
    .sign-field { font-size: 11px; color: #444; margin-top: 4px; }
    .sign-field span { color: #777; }
    .footer { margin-top: 40px; font-size: 10px; color: #999; text-align: center; }
    @media print {
        body { padding: 0; }
    }
</style>
</head>
<body>
    <div class="header">
        <div class="company">${escapeHtml(companyName)}</div>
        <div>
            <div class="doc-title">${escapeHtml(t("printTransfer.document_title"))}</div>
            <div class="doc-ref">${escapeHtml(t("printTransfer.reference_label"))}: ${escapeHtml(reference)}</div>
        </div>
    </div>

    <div class="route">
        <span>${escapeHtml(transfer.from_point_of_sale?.name || "—")}</span>
        <span class="arrow">→</span>
        <span>${escapeHtml(transfer.to_point_of_sale?.name || "—")}</span>
    </div>
    <div class="product-line">${escapeHtml(product?.product_name || "")}${product?.product_code ? ` · ${escapeHtml(product.product_code)}` : ""}</div>

    <div class="stats">
        <div>
            <div class="stat-label">${escapeHtml(t("products.transfer_quantity_sent_label"))}</div>
            <div class="stat-value">${escapeHtml(transfer.quantity_sent)}</div>
        </div>
        ${
            transfer.quantity_received != null
                ? `<div>
            <div class="stat-label">${escapeHtml(t("products.transfer_quantity_received_label"))}</div>
            <div class="stat-value">${escapeHtml(transfer.quantity_received)}</div>
        </div>`
                : ""
        }
        ${
            transfer.discrepancy > 0
                ? `<div>
            <div class="stat-label">${escapeHtml(t("products.transfer_discrepancy_label"))}</div>
            <div class="stat-value">${escapeHtml(transfer.discrepancy)}</div>
        </div>`
                : ""
        }
    </div>

    ${
        transfer.notes
            ? `<div class="section-title">${escapeHtml(t("products.transfer_reason_label"))}</div>
    <div class="notes">${escapeHtml(transfer.notes)}</div>`
            : ""
    }

    <div class="section-title">${escapeHtml(t("products.transfer_timeline_title"))}</div>
    <table>
        <thead>
            <tr>
                <th>${escapeHtml(t("printTransfer.event_column"))}</th>
                <th>${escapeHtml(t("printTransfer.actor_column"))}</th>
                <th>${escapeHtml(t("printTransfer.date_column"))}</th>
            </tr>
        </thead>
        <tbody>${historyRows}</tbody>
    </table>

    <div class="signatures">
        ${signatureBox(t("printTransfer.delivered_by"), transfer.sent_by?.username)}
        ${signatureBox(t("printTransfer.received_by"), transfer.received_by?.username)}
    </div>

    <div class="footer">${escapeHtml(t("printTransfer.printed_on", { date: printedAt }))}</div>

    <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return false;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
};
