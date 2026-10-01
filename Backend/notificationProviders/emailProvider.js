import { sendMailSafe } from "../utils/nodemailer.js";

// Thin adapter over the existing Brevo-backed mailer (utils/nodemailer.js) so
// warrantyNotification.service.js can treat email and WhatsApp the same way
// (see whatsappProvider.js's matching shape) - the NotificationProvider
// abstraction the warranties spec asks for, without a parallel email stack.
export const channel = "email";

export const isConfigured = () => {
    // sendMailSafe already no-ops when Brevo isn't configured; re-check here
    // too so warrantyNotification.service.js can decide "email unavailable"
    // BEFORE creating a WarrantyCommunication row, instead of always trying
    // and only finding out from the {skipped:true} result.
    const isPlaceholder = (value) => {
        const normalized = `${value || ""}`.trim().toLowerCase();
        return !normalized || normalized === "change_me" || normalized === "change_me@gmail.com";
    };
    return !isPlaceholder(process.env.BREVO_API_KEY) && !isPlaceholder(process.env.SENDER_EMAIL);
};

// Returns {sent, providerMessageId, error} - never throws, matching
// sendMailSafe's own contract, since warrantyNotification.service.js decides
// what to persist either way.
export const send = async ({ to, subject, html, text, fromName }) => {
    const result = await sendMailSafe(
        { from: `${(fromName || "Ohnix").replace(/[<>"]/g, "")} <${process.env.SENDER_EMAIL}>`, to, subject, html, text },
        "warranty-notification"
    );

    if (result.skipped) {
        return { sent: false, error: "Email provider not configured" };
    }
    if (!result.sent) {
        return { sent: false, error: result.error?.message || "Failed to send email" };
    }
    return { sent: true, providerMessageId: null };
};
