import dotenv from "dotenv";
dotenv.config();

// Switched SMTP (smtp.spacemail.com) -> Resend -> Brevo's HTTP API, in that
// order, on 2026-08-05/06. SMTP was dropped first because Render's outbound
// connections to Spacemail were timing out on every send in production. Then
// Resend repeatedly flagged/rejected the sending account for "unusual
// behavior" (multiple accounts created against the same domain during setup
// triggered its anti-fraud review, ending in a final rejection) - Brevo was
// picked as a less aggressive alternative. Like Resend, this is plain HTTPS
// on port 443, so it doesn't reintroduce the SMTP connectivity problem, and
// the "from" address's domain must be verified in the Brevo dashboard
// (SPF/DKIM DNS records) before sends from it will succeed.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 15000;
const SENDER_NAME = "Ohnix";

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me" || normalized === "change_me@gmail.com";
};

export const isMailConfigured = () =>
    !isPlaceholder(process.env.BREVO_API_KEY) && !isPlaceholder(process.env.SENDER_EMAIL);

// Brevo wants [{email, name?}] for to/bcc, not the plain string/array-of-
// strings shape nodemailer's mailOptions used across the codebase - normalize
// so no caller needs to change.
const toRecipientArray = (value) => {
    const list = Array.isArray(value) ? value : [value];
    const recipients = list.filter(Boolean).map((email) => ({ email }));
    return recipients.length ? recipients : undefined;
};

// "from" as used elsewhere in this codebase is often "Ohnix <addr@domain>" -
// extract just the address since Brevo's sender.name/sender.email are separate.
const extractEmailAddress = (value) => {
    const match = `${value || ""}`.match(/<([^>]+)>/);
    return (match ? match[1] : value || "").trim();
};

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

const sendMail = async ({ from, to, bcc, subject, html, text }) => {
    const response = await withTimeout(
        (signal) =>
            fetch(BREVO_API_URL, {
                method: "POST",
                headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    sender: {
                        name: SENDER_NAME,
                        email: extractEmailAddress(from) || process.env.SENDER_EMAIL,
                    },
                    // Brevo requires "to" even on bcc-only sends - fall back to the
                    // sender itself so bulk-notification callers (bcc: [...admins])
                    // don't need to pass a redundant "to".
                    to: toRecipientArray(to) || toRecipientArray(process.env.SENDER_EMAIL),
                    bcc: toRecipientArray(bcc),
                    subject,
                    htmlContent: html,
                    textContent: text,
                }),
                signal,
            }),
        BREVO_TIMEOUT_MS
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `Brevo request failed with HTTP ${response.status}`);
    }
    return payload;
};

// Kept as the default export (with a sendMail method) rather than switching
// every caller to sendMailSafe - upgradeRequestNotifications.js and
// lowStockScheduler.js call transporter.sendMail(...) directly and this way
// they didn't need to change.
const transporter = { sendMail };

export const sendMailSafe = async (mailOptions, context = "email") => {
    if (!isMailConfigured()) {
        if (process.env.NODE_ENV !== "production") {
            console.warn(
                `[mail:${context}] Skipped: BREVO_API_KEY/SENDER_EMAIL are not configured.`
            );
        }
        return { skipped: true };
    }

    try {
        await sendMail(mailOptions);
        return { sent: true };
    } catch (error) {
        console.error(`[mail:${context}] Failed to send email:`, error?.message || error);
        return { sent: false, error };
    }
};

export default transporter;
