import dotenv from "dotenv";
dotenv.config();

// Switched from SMTP (smtp.spacemail.com) to Resend's HTTP API on 2026-08-05:
// Render's outbound connections to that SMTP host were timing out on every
// send in production (confirmed in deploy logs - "Connection timeout"
// repeated on every OTP request), which is a well-known failure mode for
// regular mailbox SMTP providers under cloud/hosting IP ranges. Resend's API
// is plain HTTPS on port 443, which sidesteps that whole class of problem,
// and the "from" address's domain must be verified in the Resend dashboard
// (SPF/DKIM DNS records) before sends from it will succeed.
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15000;

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me" || normalized === "change_me@gmail.com";
};

export const isMailConfigured = () =>
    !isPlaceholder(process.env.RESEND_API_KEY) && !isPlaceholder(process.env.SENDER_EMAIL);

// toStringOrArray: Resend accepts a string or an array of strings for
// to/bcc, same shapes nodemailer's mailOptions already used across the
// codebase - no caller needs to change.
const toStringOrArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : value);

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
            fetch(RESEND_API_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: from || process.env.SENDER_EMAIL,
                    to: toStringOrArray(to),
                    bcc: toStringOrArray(bcc),
                    subject,
                    html,
                    text,
                }),
                signal,
            }),
        RESEND_TIMEOUT_MS
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `Resend request failed with HTTP ${response.status}`);
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
                `[mail:${context}] Skipped: RESEND_API_KEY/SENDER_EMAIL are not configured.`
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
