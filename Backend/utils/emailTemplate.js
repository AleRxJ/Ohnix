import { escapeHtml } from "./escapeHtml.js";

// The ONE email layout every Ohnix email renders through, so they all read as
// the same product: dark card, Ohnix mark, #29D8D5 accent, one clear status,
// one primary action, and a footer that says why you got it.
//
// Email-client constraints drive the markup: table layout + inline styles
// (Outlook ignores flex/most CSS), no web fonts or gradients relied upon,
// bulletproof button (a padded table cell, not just a styled <a>), and a
// hidden preheader for the inbox preview line. Every text field is escaped
// here; fields named `html` are trusted markup the caller already escaped
// (build them with `esc`).

export const esc = escapeHtml;

const frontendBase = () => `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");
// Images load from a PUBLIC host even when the app URL is localhost (dev):
// the email is opened on the recipient's machine, not ours.
const assetBase = () => `${process.env.EMAIL_ASSET_BASE_URL || "https://ohnix.co"}`.replace(/\/$/, "");

const C = {
    page: "#050505",
    card: "#0b0b0b",
    panel: "#111416",
    line: "#1f2a2e",
    text: "#ffffff",
    body: "#c7d1d6",
    muted: "#8b98a0",
    accent: "#29D8D5",
    onAccent: "#021314",
};

const TONES = {
    info: { color: "#29D8D5", soft: "#0e2a2a", label: { es: "Aviso", en: "Notice" } },
    success: { color: "#34d399", soft: "#0f2a20", label: { es: "Listo", en: "Done" } },
    warning: { color: "#f5a524", soft: "#2e2410", label: { es: "Atención", en: "Attention" } },
    danger: { color: "#fb7185", soft: "#2e1418", label: { es: "Urgente", en: "Urgent" } },
};

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const button = ({ label, url }, { primary = true } = {}) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${primary ? C.accent : C.card}" style="border-radius:10px;${primary ? "" : `border:1px solid ${C.line};`}">
      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${primary ? C.onAccent : C.text};text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;

const renderBlock = (block) => {
    switch (block?.type) {
        case "paragraph":
            return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${block.html ?? esc(block.text).replace(/\r?\n/g, "<br>")}</p>`;
        case "heading":
            return `<p style="margin:24px 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">${esc(block.text)}</p>`;
        case "details": {
            // Label / value pairs (plan, amount, date...).
            const rows = (block.rows || [])
                .filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== "")
                .map(
                    ([label, value, opts = {}]) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:13px;color:${C.muted};width:42%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;color:${opts.color || C.text};font-weight:${opts.bold ? 700 : 500};text-align:right;vertical-align:top;">${opts.html ? value : esc(value)}</td>
      </tr>`
                )
                .join("");
            if (!rows) return "";
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${C.panel};border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden;">${rows}</table>`;
        }
        case "table": {
            // Column table (products, lines...). columns: [{ label, align }]
            const cols = block.columns || [];
            const head = cols
                .map((c) => `<th align="${c.align || "left"}" style="padding:10px 12px;background:${C.panel};border-bottom:1px solid ${C.line};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${esc(c.label)}</th>`)
                .join("");
            const body = (block.rows || [])
                .map(
                    (cells) =>
                        `<tr>${cells
                            .map((cell, i) => {
                                const c = cols[i] || {};
                                const value = cell && typeof cell === "object" ? cell : { text: cell };
                                return `<td align="${c.align || "left"}" style="padding:11px 12px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;color:${value.color || C.text};font-weight:${value.bold ? 700 : 400};">${value.html ?? esc(value.text)}</td>`;
                            })
                            .join("")}</tr>`
                )
                .join("");
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
        }
        case "alert": {
            const tone = TONES[block.tone] || TONES.info;
            return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
  <tr>
    <td style="padding:14px 16px;background:${tone.soft};border-left:3px solid ${tone.color};border-radius:10px;font-family:${FONT};">
      ${block.title ? `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${tone.color};">${esc(block.title)}</p>` : ""}
      <p style="margin:0;font-size:14px;line-height:1.55;color:${C.body};">${block.html ?? esc(block.text)}</p>
    </td>
  </tr>
</table>`;
        }
        case "code":
            // One-time codes: big, spaced, easy to copy.
            return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
  <tr>
    <td align="center" style="padding:22px 16px;background:${C.panel};border:1px dashed ${C.accent};border-radius:12px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.accent};">${esc(block.value)}</div>
      ${block.caption ? `<div style="margin-top:8px;font-family:${FONT};font-size:12px;color:${C.muted};">${esc(block.caption)}</div>` : ""}
    </td>
  </tr>
</table>`;
        case "list":
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${(block.items || [])
                .map(
                    (item) => `
  <tr>
    <td width="22" valign="top" style="padding:3px 0;font-family:${FONT};font-size:14px;color:${C.accent};font-weight:700;">•</td>
    <td style="padding:3px 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.body};">${typeof item === "object" ? item.html : esc(item)}</td>
  </tr>`
                )
                .join("")}</table>`;
        case "button":
            return `<div style="margin:6px 0 20px;">${button(block, { primary: block.primary !== false })}</div>`;
        case "divider":
            return `<div style="height:1px;background:${C.line};margin:22px 0;line-height:1px;font-size:1px;">&nbsp;</div>`;
        case "html":
            return block.html || "";
        default:
            return "";
    }
};

/**
 * @param {object} o
 * @param {"es"|"en"} [o.lang]
 * @param {string} [o.preheader] inbox preview line
 * @param {string} [o.category] small label top-right ("Inventario")
 * @param {"info"|"success"|"warning"|"danger"} [o.tone]
 * @param {string} [o.badge] status pill text (defaults to the tone label)
 * @param {string} o.title
 * @param {string} [o.greeting] "Hola Ana,"
 * @param {string} [o.intro] plain text  |  [o.introHtml] trusted html
 * @param {Array} [o.blocks] see renderBlock
 * @param {{label:string,url:string}} [o.cta]
 * @param {{label:string,url:string}} [o.secondaryCta]
 * @param {string} [o.footnote] small text under the button
 * @param {string} [o.reason] why the recipient gets this email
 * @param {{name:string, logoUrl?:string, email?:string, color?:string}} [o.brand]
 *   A COMPANY sending to its own customers (quotations, warranty updates):
 *   its name/logo lead the header, help points to its email, and Ohnix only
 *   signs the footer as "sent with Ohnix". Omit for Ohnix's own emails.
 */
export const renderEmail = (o) => {
    const lang = o.lang === "en" ? "en" : "es";
    const tone = TONES[o.tone] || null;
    const badge = o.badge || (tone ? tone.label[lang] : null);
    const year = new Date().getFullYear();
    const site = frontendBase();
    const logo = `${assetBase()}/ohnix-icon-v2-192.png`;
    const t = lang === "en"
        ? { help: "Need help?", reply: "Reply to this email or write to", rights: "All rights reserved.", tagline: "Inventory, sales, accounting and DIAN e-invoicing for SMBs." }
        : { help: "¿Necesitas ayuda?", reply: "Responde este correo o escríbenos a", rights: "Todos los derechos reservados.", tagline: "Inventario, ventas, contabilidad y facturación DIAN para pymes." };
    const supportEmail = o.brand?.email || process.env.SUPPORT_EMAIL || "info@itcycle.co";
    const brandColor = /^#[0-9a-f]{6}$/i.test(o.brand?.color || "") ? o.brand.color : null;
    const header = o.brand
        ? `${o.brand.logoUrl ? `<img src="${esc(o.brand.logoUrl)}" height="34" alt="${esc(o.brand.name)}" style="display:inline-block;vertical-align:middle;border:0;max-width:160px;">` : ""}
                    <span style="display:inline-block;vertical-align:middle;margin-left:${o.brand.logoUrl ? "10px" : "0"};font-family:${FONT};font-size:16px;font-weight:700;color:${C.text};">${esc(o.brand.name)}</span>`
        : `<a href="${site}" target="_blank" style="text-decoration:none;">
                    <img src="${logo}" width="34" height="34" alt="Ohnix" style="display:inline-block;vertical-align:middle;border:0;border-radius:50%;">
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.28em;color:${C.text};">OHNIX</span>
                  </a>`;

    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader || o.intro || o.title)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <!-- Brand bar -->
        <tr>
          <td style="padding:0 4px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  ${header}
                </td>
                ${o.category ? `<td align="right" valign="middle" style="font-family:${FONT};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">${esc(o.category)}</td>` : ""}
              </tr>
            </table>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;overflow:hidden;">
            <div style="height:3px;line-height:3px;font-size:3px;background:${tone ? tone.color : brandColor || C.accent};">&nbsp;</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:30px 30px 8px;">
                  ${badge ? `<span style="display:inline-block;margin:0 0 14px;padding:5px 11px;border-radius:999px;background:${tone ? tone.soft : "#0e2a2a"};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${tone ? tone.color : C.accent};">${esc(badge)}</span>` : ""}
                  <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${C.text};">${esc(o.title)}</h1>
                  ${o.greeting ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};">${esc(o.greeting)}</p>` : ""}
                  ${o.introHtml || o.intro ? `<p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${o.introHtml ?? esc(o.intro)}</p>` : ""}
                  ${(o.blocks || []).map(renderBlock).join("")}
                  ${o.cta?.url ? `<div style="margin:8px 0 ${o.secondaryCta || o.footnote ? "14px" : "24px"};">${button(o.cta)}</div>` : ""}
                  ${o.secondaryCta?.url ? `<div style="margin:0 0 20px;text-align:center;"><a href="${esc(o.secondaryCta.url)}" target="_blank" style="font-family:${FONT};font-size:13px;color:${C.accent};text-decoration:underline;">${esc(o.secondaryCta.label)}</a></div>` : ""}
                  ${o.footnote ? `<p style="margin:0 0 24px;font-family:${FONT};font-size:12px;line-height:1.55;color:${C.muted};text-align:center;">${esc(o.footnote)}</p>` : ""}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 30px 24px;border-top:1px solid ${C.line};">
                  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted};">
                    <strong style="color:${C.body};">${t.help}</strong> ${o.brand ? (lang === "en" ? `Reply to this email or write to ${esc(o.brand.name)} at` : `Responde este correo o escríbele a ${esc(o.brand.name)} a`) : t.reply} <a href="mailto:${esc(supportEmail)}" style="color:${C.accent};text-decoration:none;">${esc(supportEmail)}</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">
            ${o.reason ? `<p style="margin:0 0 8px;">${esc(o.reason)}</p>` : ""}
            ${o.brand
                ? `<p style="margin:0;">${lang === "en" ? "Sent by" : "Enviado por"} ${esc(o.brand.name)} ${lang === "en" ? "with" : "con"} <a href="${site}" target="_blank" style="color:${C.muted};text-decoration:underline;">Ohnix</a>.</p>`
                : `<p style="margin:0 0 4px;"><a href="${site}" target="_blank" style="color:${C.muted};text-decoration:none;">Ohnix</a> · ${t.tagline}</p>
            <p style="margin:0;">© ${year} Ohnix by iTCycle. ${t.rights}</p>`}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

// Plain-text alternative from the same content (spam filters and text-only
// clients). Keeps it readable, never a raw HTML dump.
const stripHtml = (html = "") =>
    String(html)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

export const renderEmailText = (o) => {
    const lines = [o.title, ""];
    if (o.greeting) lines.push(o.greeting);
    if (o.intro || o.introHtml) lines.push(o.intro ?? stripHtml(o.introHtml), "");
    for (const b of o.blocks || []) {
        if (b.type === "paragraph" || b.type === "alert") lines.push([b.title, b.text ?? stripHtml(b.html)].filter(Boolean).join(": "), "");
        else if (b.type === "heading") lines.push(String(b.text).toUpperCase());
        else if (b.type === "details") lines.push(...(b.rows || []).filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== "").map(([l, v, opts = {}]) => `${l}: ${opts.html ? stripHtml(v) : v}`), "");
        else if (b.type === "table") lines.push((b.columns || []).map((c) => c.label).join(" | "), ...(b.rows || []).map((r) => r.map((c) => (c && typeof c === "object" ? c.text ?? stripHtml(c.html) : c)).join(" | ")), "");
        else if (b.type === "code") lines.push(`>> ${b.value} <<`, b.caption || "", "");
        else if (b.type === "list") lines.push(...(b.items || []).map((i) => `- ${typeof i === "object" ? stripHtml(i.html) : i}`), "");
        else if (b.type === "button") lines.push(`${b.label}: ${b.url}`, "");
    }
    if (o.cta?.url) lines.push(`${o.cta.label}: ${o.cta.url}`);
    if (o.secondaryCta?.url) lines.push(`${o.secondaryCta.label}: ${o.secondaryCta.url}`);
    if (o.footnote) lines.push("", o.footnote);
    lines.push("", "—", o.brand ? `${o.brand.name} · ${o.brand.email || ""}`.trim() : "Ohnix by iTCycle · https://ohnix.co");
    if (o.reason) lines.push(o.reason);
    return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
};

// Convenience: both bodies at once, to spread into sendMail({ ... }).
export const buildEmail = (o) => ({ html: renderEmail(o), text: renderEmailText(o) });

export const emailLinks = {
    app: (path = "") => `${frontendBase()}${path.startsWith("/") ? path : `/${path}`}`,
};

// Company row -> `brand` option. Only an absolute https logo is usable in an
// email (mail clients can't load relative paths or huge data: URIs).
export const companyBrand = (company, fallbackName = "Ohnix") => ({
    name: company?.legalName || company?.name || fallbackName,
    logoUrl: /^https:\/\//i.test(company?.logoUrl || "") ? company.logoUrl : null,
    email: company?.contactEmail || null,
    color: company?.pdfAccentColor || null,
});
