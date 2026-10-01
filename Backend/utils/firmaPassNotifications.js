import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";
import { buildEmail, emailLinks } from "./emailTemplate.js";

// Same recipient pattern as the other internal alerts: every "admin" user,
// plus an optional extra list from env for someone who monitors this
// without a full admin account.
const parseAdditionalRecipients = () =>
    (process.env.FIRMAPASS_ALERT_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

// Fired by firmaPassValidationScheduler.js when it finds validations
// auto-attached to iTCycle's FirmaPass "alianza" account (a client bought a
// certificate with the coupon) that no admin has been alerted about yet -
// see FirmaPassValidationAlert in schema.prisma. Batches every new one into
// a single email instead of one per validation.
export const notifyAdminsNewFirmaPassValidations = async ({ validations }) => {
    if (!isMailConfigured() || !validations?.length) return;
    try {
        const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
        const recipients = Array.from(new Set([...admins.map((a) => a.email?.toLowerCase()).filter(Boolean), ...parseAdditionalRecipients()]));
        if (!recipients.length) return;

        const count = validations.length;
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            bcc: recipients,
            subject: `[Interno] ${count} nueva${count === 1 ? "" : "s"} compra${count === 1 ? "" : "s"} de certificado FirmaPass`,
            ...buildEmail({
                lang: "es",
                category: "Interno · Certificados",
                tone: "info",
                badge: `${count} nueva${count === 1 ? "" : "s"}`,
                preheader: `${count} cliente${count === 1 ? "" : "s"} compró un certificado con el cupón de iTCycle.`,
                title: `Nueva${count === 1 ? "" : "s"} validación${count === 1 ? "" : "es"} de FirmaPass`,
                intro: "Un cliente compró un certificado con el cupón de iTCycle y quedó vinculado a nuestra cuenta de alianza en FirmaPass. Búscalo por nombre y compáralo con el nombre y NIT de la empresa en Ohnix para seguir con la carga del RUT y los documentos.",
                blocks: [
                    {
                        type: "table",
                        columns: [{ label: "Titular" }, { label: "Estado" }, { label: "UUID" }],
                        rows: validations.map((v) => [
                            { text: v.nombre || "(sin nombre)", bold: true },
                            v.estado_descripcion || v.estado || "?",
                            { text: v.uuid, color: "#8b98a0" },
                        ]),
                    },
                ],
                cta: { label: "Ver validaciones", url: emailLinks.app("/admin/firmapass-validations") },
                reason: "Alerta interna para el equipo de Ohnix.",
            }),
        });
    } catch (err) {
        console.error("[firmapass-validation-alert] Failed to send admin notification:", err?.message);
    }
};
