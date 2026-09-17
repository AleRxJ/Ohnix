import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";

// Same recipient pattern as notifyAdminsUpgradeRequestCreated
// (upgradeRequestNotifications.js): every user with role "admin", plus an
// optional extra list from env for someone who monitors this without a full
// admin account.
const parseAdditionalRecipients = () => {
    const raw = process.env.FIRMAPASS_ALERT_EMAILS || "";
    return raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
};

const row = (label, value) => `
    <tr>
        <td style="width:30%;padding:10px 12px;border:1px solid #1d2733;border-right:none;border-radius:10px 0 0 10px;color:#9ca3af;font-size:13px;">${label}</td>
        <td style="padding:10px 12px;border:1px solid #1d2733;border-radius:0 10px 10px 0;color:#e5e7eb;font-size:13px;">${value}</td>
    </tr>
`;

// Fired by firmaPassValidationScheduler.js when it finds validations
// auto-attached to iTCycle's FirmaPass "alianza" account (a client bought a
// certificate with the coupon) that no admin has been alerted about yet -
// see FirmaPassValidationAlert in schema.prisma. Batches every new one into
// a single email (same reasoning as sendRealtimeLowStockAlert) instead of
// one email per validation.
export const notifyAdminsNewFirmaPassValidations = async ({ validations }) => {
    if (!isMailConfigured() || !validations?.length) return;
    try {
        const adminUsers = await prisma.user.findMany({
            where: { role: "admin" },
            select: { email: true },
        });
        const recipients = Array.from(new Set([
            ...adminUsers.map((a) => a.email?.toLowerCase()).filter(Boolean),
            ...parseAdditionalRecipients(),
        ]));
        if (!recipients.length) return;

        const count = validations.length;
        const rows = validations
            .map((v) => row(
                v.nombre || "(sin nombre)",
                `${v.estado_descripcion || v.estado || "?"} · <span style="font-family:monospace;font-size:12px;">${v.uuid}</span>`,
            ))
            .join("");

        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            bcc: recipients,
            subject: `[Ohnix] ${count} nueva${count === 1 ? "" : "s"} compra${count === 1 ? "" : "s"} de certificado FirmaPass`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 6px;">🔏 Nueva${count === 1 ? "" : "s"} validación${count === 1 ? "" : "es"} de FirmaPass</h2>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;">
                        Un cliente compró un certificado con el cupón de iTCycle y quedó vinculado a nuestra cuenta de alianza en FirmaPass.
                        Búscalo por el nombre de abajo y compáralo contra el nombre/NIT de la empresa en Ohnix para continuar el proceso de carga de RUT/documentos.
                    </p>
                    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${rows}</table>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[firmapass-validation-alert] Failed to send admin notification:", err?.message);
    }
};
