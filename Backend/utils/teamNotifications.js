import transporter, { isMailConfigured } from "./nodemailer.js";
import { buildEmail, emailLinks, esc } from "./emailTemplate.js";

// Team emails - all rendered through the shared Ohnix layout
// (utils/emailTemplate.js). User-supplied names are escaped via esc().
const isEnglish = (locale) => `${locale || ""}`.toLowerCase().startsWith("en");
const from = () => `Ohnix <${process.env.SENDER_EMAIL}>`;

// ─── Invitation created / resent ───────────────────────────────────────────
export const notifyInvitationCreated = async ({ team, invitation, inviterUsername, locale, isResend = false }) => {
    if (!isMailConfigured() || !invitation?.email) return;

    const en = isEnglish(locale);
    const inviter = inviterUsername || (en ? "A teammate" : "Un compañero");
    const roleName = invitation.role?.name || "";

    try {
        await transporter.sendMail({
            from: from(),
            to: invitation.email,
            subject: en ? `${inviter} invited you to join ${team.name} on Ohnix` : `${inviter} te invitó a unirte a ${team.name} en Ohnix`,
            ...buildEmail({
                lang: en ? "en" : "es",
                category: en ? "Team" : "Equipo",
                tone: "info",
                badge: isResend ? (en ? "Invitation renewed" : "Invitación renovada") : en ? "Invitation" : "Invitación",
                preheader: en ? `Join ${team.name} on Ohnix. The invitation expires in 72 hours.` : `Únete a ${team.name} en Ohnix. La invitación vence en 72 horas.`,
                title: en ? `Join ${team.name} on Ohnix` : `Únete a ${team.name} en Ohnix`,
                introHtml: en
                    ? `<strong>${esc(inviter)}</strong> invited you to work together on Ohnix.`
                    : `<strong>${esc(inviter)}</strong> te invitó a trabajar juntos en Ohnix.`,
                blocks: [
                    {
                        type: "details",
                        rows: [
                            [en ? "Team" : "Equipo", team.name],
                            [en ? "Your role" : "Tu rol", roleName, { bold: true }],
                            [en ? "Expires" : "Vence", en ? "In 72 hours" : "En 72 horas"],
                        ],
                    },
                ],
                cta: { label: en ? "Accept invitation" : "Aceptar invitación", url: emailLinks.app(`/team/invite/${invitation.token}`) },
                footnote: en ? "If you weren't expecting this invitation, you can ignore it." : "Si no esperabas esta invitación, puedes ignorarla.",
                reason: en ? `You get this because ${inviter} invited this email address.` : `Recibes este correo porque ${inviter} invitó esta dirección.`,
            }),
        });
    } catch (err) {
        console.error("[team-invitation] Failed to send:", err?.message);
    }
};

// ─── Role changed ───────────────────────────────────────────────────────
export const notifyRoleChanged = async ({ team, member }) => {
    if (!isMailConfigured() || !member?.user?.email) return;

    const en = isEnglish(member.user.preferredLanguage);
    try {
        await transporter.sendMail({
            from: from(),
            to: member.user.email,
            subject: en ? `Your role on ${team.name} changed` : `Tu rol en ${team.name} cambió`,
            ...buildEmail({
                lang: en ? "en" : "es",
                category: en ? "Team" : "Equipo",
                tone: "info",
                badge: en ? "Role updated" : "Rol actualizado",
                title: en ? "Your team role changed" : "Tu rol en el equipo cambió",
                introHtml: en
                    ? `Your role on <strong>${esc(team.name)}</strong> is now <strong>${esc(member.role.name)}</strong>.`
                    : `Tu rol en <strong>${esc(team.name)}</strong> ahora es <strong>${esc(member.role.name)}</strong>.`,
                blocks: [
                    {
                        type: "paragraph",
                        text: en
                            ? "This may change which modules and actions you have access to. Sign in again if something looks different."
                            : "Esto puede cambiar a qué módulos y acciones tienes acceso. Si ves algo distinto, vuelve a iniciar sesión.",
                    },
                ],
                cta: { label: en ? "Open Ohnix" : "Abrir Ohnix", url: emailLinks.app("/dashboard") },
                reason: en ? `You're a member of ${team.name} on Ohnix.` : `Eres miembro de ${team.name} en Ohnix.`,
            }),
        });
    } catch (err) {
        console.error("[team-role-changed] Failed to send:", err?.message);
    }
};

// ─── Member removed ───────────────────────────────────────────────────────
export const notifyMemberRemoved = async ({ team, removedUser }) => {
    if (!isMailConfigured() || !removedUser?.email) return;

    const en = isEnglish(removedUser.preferredLanguage);
    try {
        await transporter.sendMail({
            from: from(),
            to: removedUser.email,
            subject: en ? `You no longer have access to ${team.name}` : `Ya no tienes acceso a ${team.name}`,
            ...buildEmail({
                lang: en ? "en" : "es",
                category: en ? "Team" : "Equipo",
                tone: "warning",
                badge: en ? "Access removed" : "Acceso retirado",
                title: en ? `You left ${team.name}` : `Saliste de ${team.name}`,
                introHtml: en
                    ? `An administrator removed you from <strong>${esc(team.name)}</strong>. You no longer have access to its data on Ohnix.`
                    : `Un administrador te retiró de <strong>${esc(team.name)}</strong>. Ya no tienes acceso a sus datos en Ohnix.`,
                blocks: [
                    {
                        type: "paragraph",
                        text: en
                            ? "Your login still works: it now starts as your own account, with no data of its own."
                            : "Tu usuario sigue funcionando: ahora inicia como una cuenta propia, sin datos.",
                    },
                ],
                footnote: en ? "If you think this was a mistake, contact the team's administrator." : "Si crees que es un error, contacta al administrador del equipo.",
                reason: en ? `You were a member of ${team.name} on Ohnix.` : `Eras miembro de ${team.name} en Ohnix.`,
            }),
        });
    } catch (err) {
        console.error("[team-member-removed] Failed to send:", err?.message);
    }
};

// ─── Invitation expiring soon reminder (used by a future scheduler pass) ──
export const notifyInvitationExpiringSoon = async ({ invitation, team }) => {
    if (!isMailConfigured() || !invitation?.email) return;

    try {
        await transporter.sendMail({
            from: from(),
            to: invitation.email,
            subject: `Tu invitación a ${team.name} vence pronto`,
            ...buildEmail({
                lang: "es",
                category: "Equipo",
                tone: "warning",
                badge: "Vence pronto",
                preheader: `Acepta tu invitación a ${team.name} antes de que expire.`,
                title: "Tu invitación está por vencer",
                introHtml: `Todavía no has aceptado tu invitación para unirte a <strong>${esc(team.name)}</strong> en Ohnix. Acéptala antes de que expire.`,
                cta: { label: "Aceptar invitación", url: emailLinks.app(`/team/invite/${invitation.token}`) },
                footnote: "Si ya no te interesa, ignora este correo y la invitación vencerá sola.",
                reason: "Recibes este recordatorio porque tienes una invitación pendiente en Ohnix.",
            }),
        });
    } catch (err) {
        console.error("[team-invitation-reminder] Failed to send:", err?.message);
    }
};
