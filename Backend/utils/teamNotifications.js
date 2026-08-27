import transporter, { isMailConfigured } from "./nodemailer.js";

// Same visual language as upgradeRequestNotifications.js's emails (dark card,
// #29D8D5 accent) so team emails don't look like a different product.
const frontendBase = () => `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");

const wrapEmail = ({ eyebrow = "OHNIX", title, body, ctaLabel, ctaUrl, accent = "#29D8D5" }) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid ${accent};border-radius:12px;">
        <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:8px;">${eyebrow}</div>
        <h2 style="color:${accent};margin:0 0 16px;">${title}</h2>
        <p style="font-size:15px;color:#e5e7eb;line-height:1.6;margin:0 0 20px;">${body}</p>
        ${
            ctaUrl
                ? `<div style="text-align:center;margin:28px 0;">
                    <a href="${ctaUrl}" style="background:${accent};color:#021314;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px;display:inline-block;">${ctaLabel}</a>
                   </div>`
                : ""
        }
        <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
        <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
    </div>
`;

// ─── Invitation created / resent ───────────────────────────────────────────
export const notifyInvitationCreated = async ({ team, invitation, inviterUsername, locale, isResend = false }) => {
    if (!isMailConfigured() || !invitation?.email) return;

    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const inviteUrl = `${frontendBase()}/team/invite/${invitation.token}`;
    const roleName = invitation.role?.name || "";

    const subject = isEN
        ? `[Ohnix] ${inviterUsername || "Someone"} invited you to join "${team.name}"`
        : `[Ohnix] ${inviterUsername || "Alguien"} te invitó a unirte a "${team.name}"`;

    const title = isEN ? "You've been invited to a team" : "Te invitaron a un equipo";

    const body = isEN
        ? `<strong>${inviterUsername || "A teammate"}</strong> invited you to join <strong>${team.name}</strong> on Ohnix as <strong>${roleName}</strong>. This invitation expires in 72 hours${isResend ? " (renewed)" : ""}.`
        : `<strong>${inviterUsername || "Un compañero"}</strong> te invitó a unirte a <strong>${team.name}</strong> en Ohnix con el rol <strong>${roleName}</strong>. Esta invitación vence en 72 horas${isResend ? " (renovada)" : ""}.`;

    const cta = isEN ? "Accept invitation" : "Aceptar invitación";

    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: invitation.email,
            subject,
            html: wrapEmail({ title, body, ctaLabel: cta, ctaUrl: inviteUrl }),
        });
    } catch (err) {
        console.error("[team-invitation] Failed to send:", err?.message);
    }
};

// ─── Role changed ───────────────────────────────────────────────────────
export const notifyRoleChanged = async ({ team, member }) => {
    if (!isMailConfigured() || !member?.user?.email) return;

    const isEN = `${member.user.preferredLanguage || ""}`.toLowerCase().startsWith("en");
    const subject = isEN
        ? `[Ohnix] Your role on "${team.name}" changed`
        : `[Ohnix] Tu rol en "${team.name}" cambió`;
    const title = isEN ? "Your team role changed" : "Tu rol en el equipo cambió";
    const body = isEN
        ? `Your role on <strong>${team.name}</strong> is now <strong>${member.role.name}</strong>. This may change which modules you can access.`
        : `Tu rol en <strong>${team.name}</strong> ahora es <strong>${member.role.name}</strong>. Esto puede cambiar a qué módulos tienes acceso.`;

    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: member.user.email,
            subject,
            html: wrapEmail({ title, body, accent: "#f59e0b" }),
        });
    } catch (err) {
        console.error("[team-role-changed] Failed to send:", err?.message);
    }
};

// ─── Member removed ───────────────────────────────────────────────────────
export const notifyMemberRemoved = async ({ team, removedUser }) => {
    if (!isMailConfigured() || !removedUser?.email) return;

    const isEN = `${removedUser.preferredLanguage || ""}`.toLowerCase().startsWith("en");
    const subject = isEN
        ? `[Ohnix] You were removed from "${team.name}"`
        : `[Ohnix] Fuiste removido de "${team.name}"`;
    const title = isEN ? "You were removed from a team" : "Fuiste removido de un equipo";
    const body = isEN
        ? `You no longer have access to <strong>${team.name}</strong>'s data on Ohnix. Your login still works, but it now starts fresh with no data of its own.`
        : `Ya no tienes acceso a los datos de <strong>${team.name}</strong> en Ohnix. Tu cuenta sigue funcionando, pero ahora empieza sin datos propios.`;

    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: removedUser.email,
            subject,
            html: wrapEmail({ title, body, accent: "#ef4444" }),
        });
    } catch (err) {
        console.error("[team-member-removed] Failed to send:", err?.message);
    }
};

// ─── Invitation expiring soon reminder (used by a future scheduler pass) ──
export const notifyInvitationExpiringSoon = async ({ invitation, team }) => {
    if (!isMailConfigured() || !invitation?.email) return;

    const inviteUrl = `${frontendBase()}/team/invite/${invitation.token}`;
    const body = `Tu invitación para unirte a <strong>${team.name}</strong> en Ohnix vence pronto. Acéptala antes de que expire.`;

    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: invitation.email,
            subject: `[Ohnix] Tu invitación a "${team.name}" vence pronto`,
            html: wrapEmail({
                title: "Tu invitación está por vencer",
                body,
                ctaLabel: "Aceptar invitación",
                ctaUrl: inviteUrl,
                accent: "#f59e0b",
            }),
        });
    } catch (err) {
        console.error("[team-invitation-reminder] Failed to send:", err?.message);
    }
};
