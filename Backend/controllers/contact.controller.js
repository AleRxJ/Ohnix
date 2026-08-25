import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendMailSafe } from "../utils/nodemailer.js";

const escapeHtml = (value) =>
    `${value ?? ""}`.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));

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
            subject: `New contact form submission from ${name.trim()}`,
            text: `Name: ${name.trim()}\nEmail: ${email.trim()}\nPhone: ${phone?.trim() || "-"}\nCompany: ${company?.trim() || "-"}\n\nMessage:\n${message.trim()}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:8px;">OHNIX</div>
                    <h2 style="color:#29D8D5;margin:0 0 16px;">New contact form submission</h2>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(phone?.trim() || "-")}</p>
                    <p style="font-size:14px;color:#e5e7eb;margin:0 0 6px;"><strong>Company:</strong> ${escapeHtml(company?.trim() || "-")}</p>
                    <p style="font-size:14px;color:#e5e7eb;line-height:1.6;margin:16px 0 0;white-space:pre-wrap;">${escapeHtml(message.trim())}</p>
                </div>
            `,
        },
        "contact-form"
    );

    if (result?.error) {
        throw new ApiError(502, "Could not send your message right now. Please try again later.");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Your message has been sent."));
});
