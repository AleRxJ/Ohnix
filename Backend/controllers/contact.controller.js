import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendMailSafe } from "../utils/nodemailer.js";
import { sendContactFormLeadEvent } from "../services/metaConversionsApi.service.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { buildEmail } from "../utils/emailTemplate.js";

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
            ...buildEmail({
                lang: "es",
                category: "Interno · Contacto",
                tone: "info",
                badge: "Nuevo mensaje",
                preheader: `${name.trim()}${company?.trim() ? ` (${company.trim()})` : ""} escribió desde el formulario de contacto.`,
                title: "Nuevo mensaje de contacto",
                intro: "Alguien escribió desde el formulario de ohnix.co. Responde este correo para contestarle directamente.",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Nombre", name.trim(), { bold: true }],
                            ["Correo", email.trim()],
                            ["Teléfono", phone?.trim() || "—"],
                            ["Empresa", company?.trim() || "—"],
                        ],
                    },
                    { type: "heading", text: "Mensaje" },
                    { type: "paragraph", html: escapeHtml(message.trim()).split("\n").join("<br>") },
                ],
                cta: { label: "Responder", url: `mailto:${encodeURIComponent(email.trim())}` },
                reason: "Alerta interna para el equipo de Ohnix.",
            }),
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
