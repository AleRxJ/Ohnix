import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendMailSafe } from "../utils/nodemailer.js";
import { sendContactFormLeadEvent } from "../services/metaConversionsApi.service.js";
import { escapeHtml } from "../utils/escapeHtml.js";

// Landing page "Contact us" form (public, unauthenticated) - previously only
// simulated a network call in the frontend and never reached the backend,
// so submissions were silently dropped.
export const submitContactForm = asyncHandler(async (req, res) => {
    const { name, email, phone, company, message } = req.body || {};

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
        throw new ApiError(400, "Name, email and message are required.");
    }

    const emailPattern = /^[^@\s]+@[^@\s]+$/;
    if (!emailPattern.test(email.trim())) {
        throw new ApiError(400, "Please provide a valid email address.");
    }

    const recipient = process.env.CONTACT_FORM_TO_EMAIL || process.env.SENDER_EMAIL;

    const result = await sendMailSafe(
        {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: recipient,
            replyTo: email.trim(),
            subject: `[Ohnix] Nuevo mensaje de contacto de ${name.trim()}`,
            text: `Nombre: ${name.trim()}\nCorreo: ${email.trim()}\nTeléfono: ${phone?.trim() || "-"}\nEmpresa: ${company?.trim() || "-"}\n\nMensaje:\n${message.trim()}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:8px;">OHNIX</div>
                    <h2 style="color:#29D8D5;margin:0 0 16px;">Nuevo mensaje de contacto</h2>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Nombre:</strong> ${escapeHtml(name.trim())}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Correo:</strong> ${escapeHtml(email.trim())}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Teléfono:</strong> ${escapeHtml(phone?.trim() || "-")}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Empresa:</strong> ${escapeHtml(company?.trim() || "-")}</p>
                    <p style="font-size:14px;color:#e5e7eb;line-height:1.6;margin:16px 0 0;white-space:pre-wrap;">${escapeHtml(message.trim())}</p>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        },
        "contact-form"
    );

    if (result?.error) {
        throw new ApiError(502, "Could not send your message right now. Please try again later.");
    }

    sendContactFormLeadEvent({
        email: email.trim(),
        phone: phone?.trim(),
        clientIp: req.ip,
        userAgent: req.headers["user-agent"],
        eventSourceUrl: req.headers.referer,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Your message has been sent."));
});
