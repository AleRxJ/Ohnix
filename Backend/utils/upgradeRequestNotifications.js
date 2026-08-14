import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";

// ─── Plan renewal reminder ────────────────────────────────────────────────────
export const notifyUserRenewalReminder = async ({ user, plan, endsAt, daysLeft, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "";
    const endsAtFormatted = new Date(endsAt).toLocaleDateString(isEN ? "en-US" : "es-CO", {
        year: "numeric", month: "long", day: "numeric",
    });
    const subject = isEN
        ? `[Ohnix] Your ${planLabel} plan has expired — renew to keep access`
        : `[Ohnix] Tu plan ${planLabel} venció — renueva para mantener el acceso`;
    const title = isEN ? `Your ${planLabel} plan has expired` : `Tu plan ${planLabel} venció`;
    const body = isEN
        ? `Hello <strong>${user.username || "there"}</strong>, your <strong>${planLabel}</strong> plan expired yesterday. You have a few days to renew before losing full access to your data and features.`
        : `Hola <strong>${user.username || ""}</strong>, tu plan <strong>${planLabel}</strong> venció ayer. Tienes unos días para renovar antes de perder el acceso completo a tus datos y funcionalidades.`;
    const cta = isEN ? "Renew my plan" : "Renovar mi plan";
    const frontendBase = `${process.env.FRONTEND_URL || "https://www.ohnix.co"}`.replace(/\/$/, "");
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#f59e0b;margin:0 0 12px;">⏳ ${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${frontendBase}/billing" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${cta}</a>
                    </div>
                    <p style="color:#6b7280;font-size:13px;text-align:center;">Si ya renovaste, ignora este mensaje.</p>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[renewal-reminder] Failed to send:", err?.message);
    }
};

// ─── Trial ending soon ────────────────────────────────────────────────────
// Starter is a paid plan ($19/mo, see pricing.middleware.js) - once the
// 14-day trial ends, staying on Ohnix requires a subscription. Sent a few
// days before trialEndsAt so the user isn't blocked with zero warning.
export const notifyUserTrialEndingSoon = async ({ user, trialEndsAt, daysLeft, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const endsAtFormatted = new Date(trialEndsAt).toLocaleDateString(isEN ? "en-US" : "es-CO", {
        year: "numeric", month: "long", day: "numeric",
    });
    const subject = isEN
        ? `[Ohnix] Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`
        : `[Ohnix] Tu prueba gratuita termina en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`;
    const title = isEN ? "Your free trial is ending soon" : "Tu prueba gratuita está por terminar";
    const body = isEN
        ? `Hello <strong>${user.username || "there"}</strong>, your 14-day free trial ends on <strong>${endsAtFormatted}</strong>. Subscribe to the Starter plan ($19/mo) or a higher tier to keep using Ohnix without interruptions.`
        : `Hola <strong>${user.username || ""}</strong>, tu prueba gratuita de 14 días termina el <strong>${endsAtFormatted}</strong>. Suscríbete al plan Emprendedor ($19/mes) o a uno superior para seguir usando Ohnix sin interrupciones.`;
    const cta = isEN ? "Subscribe now" : "Suscribirme ahora";
    const frontendBase = `${process.env.FRONTEND_URL || "https://www.ohnix.co"}`.replace(/\/$/, "");
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#f59e0b;margin:0 0 12px;">⏳ ${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${frontendBase}/billing" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${cta}</a>
                    </div>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[trial-ending] Failed to send:", err?.message);
    }
};

// ─── Plan activated confirmation ────────────────────────────────────────────
export const notifyUserPlanActivated = async ({ user, targetPlan, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const planLabel = targetPlan
        ? targetPlan.charAt(0).toUpperCase() + targetPlan.slice(1)
        : "";
    const subject = isEN
        ? `[Ohnix] Your ${planLabel} plan is now active`
        : `[Ohnix] Tu plan ${planLabel} ya está activo`;
    const title = isEN ? `Plan ${planLabel} activated` : `Plan ${planLabel} activado`;
    const body = isEN
        ? `Hello <strong>${user.username || "there"}</strong>, your payment has been confirmed and your <strong>${planLabel}</strong> plan is now active. Your new limits are available immediately.`
        : `Hola <strong>${user.username || ""}</strong>, tu pago fue confirmado y tu plan <strong>${planLabel}</strong> ya está activo. Tus nuevos límites están disponibles de inmediato.`;
    const cta = isEN ? "Go to Dashboard" : "Ir al Dashboard";
    const footer = isEN ? "Ohnix by iTCycle" : "Ohnix by iTCycle";
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 12px;">✅ ${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${process.env.FRONTEND_URL || ""}" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${cta}</a>
                    </div>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} ${footer}. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[plan-activated] Failed to send notification:", err?.message);
    }
};

// ─── Payment failed / rejected ───────────────────────────────────────────────
// Fired when a webhook (ePayco confirmation, Stripe async_payment_failed)
// determines a payment did NOT go through - without this, a user whose
// delayed-method payment (PSE, bank transfer) fails hours after checkout has
// no way of finding out short of noticing PaymentSuccess.jsx never resolved.
//
// `reason` mirrors the paymentStatus written to the request ("rejected" |
// "failed" | "expired") so the copy doesn't blame the user's card for a
// gateway-side technical error, or vice versa - a card genuinely declined
// for insufficient funds needs different guidance ("check your card/funds")
// than ePayco's own systems failing to communicate with the authorization
// center ("this wasn't your card's fault, just try again").
const PAYMENT_FAILED_COPY = {
    rejected: {
        es: (planLabel, username) =>
            `Hola <strong>${username || ""}</strong>, tu banco o la pasarela de pago rechazó el cobro para actualizar a <strong>${planLabel}</strong>. No se activó ningún cargo en tu cuenta. Verifica los datos de tu tarjeta o los fondos disponibles, y vuelve a intentarlo.`,
        en: (planLabel, username) =>
            `Hello <strong>${username || "there"}</strong>, your bank or payment gateway declined the charge to upgrade to <strong>${planLabel}</strong>. No charge was made to your account. Check your card details or available funds and try again.`,
    },
    failed: {
        es: (planLabel, username) =>
            `Hola <strong>${username || ""}</strong>, tuvimos un error técnico al procesar tu pago para actualizar a <strong>${planLabel}</strong> - no fue un problema con tu tarjeta. No se activó ningún cargo en tu cuenta. Puedes intentarlo de nuevo, es probable que funcione en el siguiente intento.`,
        en: (planLabel, username) =>
            `Hello <strong>${username || "there"}</strong>, we hit a technical error processing your payment to upgrade to <strong>${planLabel}</strong> - this wasn't an issue with your card. No charge was made to your account. You can try again, it will likely go through on the next attempt.`,
    },
    expired: {
        es: (planLabel, username) =>
            `Hola <strong>${username || ""}</strong>, el tiempo para completar tu pago para actualizar a <strong>${planLabel}</strong> se agotó. No se activó ningún cargo en tu cuenta. Puedes intentarlo de nuevo cuando quieras.`,
        en: (planLabel, username) =>
            `Hello <strong>${username || "there"}</strong>, the time window to complete your payment to upgrade to <strong>${planLabel}</strong> ran out. No charge was made to your account. You can try again anytime.`,
    },
    default: {
        es: (planLabel, username) =>
            `Hola <strong>${username || ""}</strong>, no pudimos confirmar tu pago para actualizar a <strong>${planLabel}</strong> con nuestro proveedor de pagos. No se activó ningún cargo en tu cuenta. Puedes intentarlo de nuevo con el mismo método u otro distinto.`,
        en: (planLabel, username) =>
            `Hello <strong>${username || "there"}</strong>, your payment to upgrade to <strong>${planLabel}</strong> could not be confirmed by our payment provider. No charge was activated on your account. You can try again with the same or a different payment method.`,
    },
};

export const notifyUserPaymentFailed = async ({ request, user, locale, reason }) => {
    if (!isMailConfigured() || !user?.email || !request?.targetPlan) return;
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const planLabel = request.targetPlan.charAt(0).toUpperCase() + request.targetPlan.slice(1);
    const subject = isEN
        ? `[Ohnix] Your payment for the ${planLabel} plan could not be confirmed`
        : `[Ohnix] No pudimos confirmar tu pago del plan ${planLabel}`;
    const title = isEN ? "Payment not confirmed" : "Pago no confirmado";
    const copy = PAYMENT_FAILED_COPY[reason] || PAYMENT_FAILED_COPY.default;
    const body = copy[isEN ? "en" : "es"](planLabel, user.username);
    const cta = isEN ? "Try again" : "Intentar de nuevo";
    const frontendBase = `${process.env.FRONTEND_URL || "https://www.ohnix.co"}`.replace(/\/$/, "");
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#ef4444;margin:0 0 12px;">⚠️ ${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${frontendBase}/billing" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${cta}</a>
                    </div>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[payment-failed] Failed to send notification:", err?.message);
    }
};

// ─── Email verified confirmation ─────────────────────────────────────────────
export const notifyUserEmailVerified = async ({ user, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const subject = isEN ? "[Ohnix] Email verified ✅" : "[Ohnix] Correo verificado ✅";
    const title = isEN ? "Account verified" : "Cuenta verificada";
    const body = isEN
        ? `Hello <strong>${user.username || "there"}</strong>, your email has been verified successfully. Your account is now fully active.`
        : `Hola <strong>${user.username || ""}</strong>, tu correo fue verificado exitosamente. Tu cuenta está completamente activa.`;
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 12px;">✅ ${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[email-verified] Failed to send notification:", err?.message);
    }
};

// ─── New user registered → admin notification ────────────────────────────────
export const notifyAdminsNewUserRegistered = async ({ user }) => {
    if (!isMailConfigured() || !user?.email) return;
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
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            bcc: recipients,
            subject: `[Ohnix] Nuevo usuario registrado: ${user.username}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #1d2733;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 12px;">👤 Nuevo usuario registrado</h2>
                    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">
                        <tr><td style="color:#9ca3af;padding:8px 12px;border:1px solid #1d2733;border-radius:8px 0 0 8px;width:35%;">Usuario</td><td style="color:#e5e7eb;padding:8px 12px;border:1px solid #1d2733;border-radius:0 8px 8px 0;">${user.username}</td></tr>
                        <tr><td style="color:#9ca3af;padding:8px 12px;border:1px solid #1d2733;border-radius:8px 0 0 8px;">Email</td><td style="color:#e5e7eb;padding:8px 12px;border:1px solid #1d2733;border-radius:0 8px 8px 0;">${user.email}</td></tr>
                        <tr><td style="color:#9ca3af;padding:8px 12px;border:1px solid #1d2733;border-radius:8px 0 0 8px;">Plan</td><td style="color:#e5e7eb;padding:8px 12px;border:1px solid #1d2733;border-radius:0 8px 8px 0;">${user.plan || "starter"}</td></tr>
                        <tr><td style="color:#9ca3af;padding:8px 12px;border:1px solid #1d2733;border-radius:8px 0 0 8px;">Fecha</td><td style="color:#e5e7eb;padding:8px 12px;border:1px solid #1d2733;border-radius:0 8px 8px 0;">${new Date().toLocaleString()}</td></tr>
                    </table>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[new-user-admin] Failed to send notification:", err?.message);
    }
};

const BRAND = {
    bg: "#050608",
    panel: "#0b0f14",
    border: "#1d2733",
    accent: "#29D8D5",
    accentSoft: "#44F3F0",
    text: "#e5e7eb",
    muted: "#9ca3af",
};

const resolveLocale = (localeHint) => {
    const normalized = `${localeHint || process.env.DEFAULT_EMAIL_LOCALE || "es"}`
        .toLowerCase()
        .trim();

    return normalized.startsWith("en") ? "en" : "es";
};

const getCopy = (locale) => {
    if (locale === "en") {
        return {
            adminSubject: (fromPlan, toPlan) =>
                `[Ohnix] New upgrade request: ${fromPlan} -> ${toPlan}`,
            adminTitle: "New plan upgrade request",
            adminSubtitle: "A user submitted a request to change plan.",
            userSubject: (decisionLabel) =>
                `[Ohnix] Your upgrade request was ${decisionLabel}`,
            userTitle: "Upgrade request update",
            userSubtitle: (username, decisionLabel) =>
                `Hello ${username || "there"}, your request has been ${decisionLabel}.`,
            labels: {
                requestId: "Request ID",
                source: "Source",
                user: "User",
                currentPlan: "Current plan",
                targetPlan: "Target plan",
                createdAt: "Created at",
                decisionTime: "Decision time",
                reviewedBy: "Reviewed by",
                notes: "Notes",
                adminResponse: "Admin response",
            },
            textAdmin: {
                intro: "A new plan upgrade request was created.",
            },
            textUser: {
                greeting: (username) => `Hello ${username || "there"},`,
                intro: (decisionLabel) =>
                    `Your plan upgrade request has been ${decisionLabel}.`,
                outro: "You can review the request details in your Billing section.",
            },
            na: "N/A",
        };
    }

    return {
        adminSubject: (fromPlan, toPlan) =>
            `[Ohnix] Nueva solicitud de upgrade: ${fromPlan} -> ${toPlan}`,
        adminTitle: "Nueva solicitud de cambio de plan",
        adminSubtitle: "Un usuario envio una solicitud para cambiar su plan.",
        userSubject: (decisionLabel) =>
            `[Ohnix] Tu solicitud de upgrade fue ${decisionLabel}`,
        userTitle: "Actualizacion de solicitud de upgrade",
        userSubtitle: (username, decisionLabel) =>
            `Hola ${username || ""}, tu solicitud fue ${decisionLabel}.`,
        labels: {
            requestId: "ID de solicitud",
            source: "Origen",
            user: "Usuario",
            currentPlan: "Plan actual",
            targetPlan: "Plan solicitado",
            createdAt: "Fecha de creacion",
            decisionTime: "Fecha de decision",
            reviewedBy: "Revisado por",
            notes: "Notas",
            adminResponse: "Respuesta admin",
        },
        textAdmin: {
            intro: "Se ha creado una nueva solicitud de cambio de plan.",
        },
        textUser: {
            greeting: (username) => `Hola ${username || ""},`,
            intro: (decisionLabel) =>
                `Tu solicitud de cambio de plan fue ${decisionLabel}.`,
            outro: "Puedes revisar el detalle en la seccion de Facturacion.",
        },
        na: "N/A",
    };
};

const getDecisionLabel = (status, locale) => {
    if (locale === "en") {
        if (status === "approved") return "approved";
        if (status === "rejected") return "rejected";
        if (status === "closed") return "activated";
        return status;
    }

    if (status === "approved") return "aprobada";
    if (status === "rejected") return "rechazada";
    if (status === "closed") return "activada";
    return status;
};

const wrapBrandEmail = ({ title, subtitle, bodyRows }) => `
    <div style="background:${BRAND.bg};padding:24px 12px;font-family:Arial,sans-serif;">
        <div style="max-width:680px;margin:0 auto;border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;background:${BRAND.panel};">
            <div style="padding:18px 22px;background:linear-gradient(120deg, rgba(41,216,213,0.22), rgba(68,243,240,0.08));border-bottom:1px solid ${BRAND.border};">
                <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:${BRAND.accent};font-weight:700;">OHNIX</div>
                <h2 style="margin:10px 0 8px;color:${BRAND.text};font-size:22px;line-height:1.2;">${title}</h2>
                <p style="margin:0;color:${BRAND.muted};font-size:14px;line-height:1.5;">${subtitle}</p>
            </div>
            <div style="padding:20px 22px;">
                <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">${bodyRows}</table>
            </div>
            <div style="padding:14px 22px;border-top:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;">
                Ohnix by ITCycle
            </div>
        </div>
    </div>
`;

const row = (label, value) => `
    <tr>
        <td style="width:36%;padding:10px 12px;border:1px solid ${BRAND.border};border-right:none;border-radius:10px 0 0 10px;color:${BRAND.muted};font-size:13px;">${label}</td>
        <td style="padding:10px 12px;border:1px solid ${BRAND.border};border-radius:0 10px 10px 0;color:${BRAND.text};font-size:13px;">${value}</td>
    </tr>
`;

const parseAdditionalRecipients = () => {
    const raw = process.env.UPGRADE_ALERT_EMAILS || "";
    return raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
};

export const notifyAdminsUpgradeRequestCreated = async ({
    request,
    user,
    source = "app",
    locale,
}) => {
    try {
        if (!request?.id || !user?.email) {
            return;
        }

        const adminUsers = await prisma.user.findMany({
            where: { role: "admin" },
            select: { email: true },
        });

        const recipients = Array.from(
            new Set([
                ...adminUsers.map((admin) => admin.email?.toLowerCase()).filter(Boolean),
                ...parseAdditionalRecipients(),
            ])
        );

        if (!recipients.length || !isMailConfigured()) {
            if (process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true") {
                console.warn("[upgrade-notify] Admin email skipped: mail not configured or no recipients.");
            }
            return;
        }

        const language = resolveLocale(locale);
        const copy = getCopy(language);
        const subject = copy.adminSubject(request.currentPlan, request.targetPlan);
        const createdAt = request.createdAt
            ? new Date(request.createdAt).toLocaleString()
            : new Date().toLocaleString();

        const text = [
            copy.textAdmin.intro,
            `${copy.labels.requestId}: ${request.id}`,
            `${copy.labels.source}: ${source}`,
            `${copy.labels.user}: ${user.username || copy.na} (${user.email})`,
            `${copy.labels.currentPlan}: ${request.currentPlan}`,
            `${copy.labels.targetPlan}: ${request.targetPlan}`,
            `${copy.labels.createdAt}: ${createdAt}`,
            `${copy.labels.notes}: ${request.notes || copy.na}`,
        ].join("\n");

        const html = wrapBrandEmail({
            title: copy.adminTitle,
            subtitle: copy.adminSubtitle,
            bodyRows: [
                row(copy.labels.requestId, request.id),
                row(copy.labels.source, source),
                row(copy.labels.user, `${user.username || copy.na} (${user.email})`),
                row(copy.labels.currentPlan, request.currentPlan),
                row(copy.labels.targetPlan, request.targetPlan),
                row(copy.labels.createdAt, createdAt),
                row(copy.labels.notes, request.notes || copy.na),
            ].join(""),
        });

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            bcc: recipients,
            subject,
            text,
            html,
        });
    } catch (error) {
        console.error("Failed to send upgrade request admin notification:", error);
    }
};

export const notifyUserUpgradeRequestResolved = async ({
    request,
    user,
    actedBy = "admin",
    locale,
}) => {
    try {
        if (!request?.id || !user?.email) {
            return;
        }

        if (!["approved", "rejected", "closed"].includes(request.status)) {
            return;
        }

        if (!isMailConfigured()) {
            if (process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true") {
                console.warn("[upgrade-notify] User resolution email skipped: mail not configured.");
            }
            return;
        }

        const language = resolveLocale(locale);
        const copy = getCopy(language);
        const decisionLabel = getDecisionLabel(request.status, language);
        const subject = copy.userSubject(decisionLabel);
        const resolvedAt = request.updatedAt
            ? new Date(request.updatedAt).toLocaleString()
            : new Date().toLocaleString();

        const text = [
            copy.textUser.greeting(user.username),
            "",
            copy.textUser.intro(decisionLabel),
            `${copy.labels.requestId}: ${request.id}`,
            `${copy.labels.currentPlan}: ${request.currentPlan}`,
            `${copy.labels.targetPlan}: ${request.targetPlan}`,
            `${copy.labels.decisionTime}: ${resolvedAt}`,
            `${copy.labels.reviewedBy}: ${actedBy}`,
            `${copy.labels.adminResponse}: ${request.adminResponse || copy.na}`,
            "",
            copy.textUser.outro,
        ].join("\n");

        const html = wrapBrandEmail({
            title: copy.userTitle,
            subtitle: copy.userSubtitle(user.username, decisionLabel),
            bodyRows: [
                row(copy.labels.requestId, request.id),
                row(copy.labels.currentPlan, request.currentPlan),
                row(copy.labels.targetPlan, request.targetPlan),
                row(copy.labels.decisionTime, resolvedAt),
                row(copy.labels.reviewedBy, actedBy),
                row(copy.labels.adminResponse, request.adminResponse || copy.na),
            ].join(""),
        });

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject,
            text,
            html,
        });
    } catch (error) {
        console.error("Failed to send upgrade resolution notification to user:", error);
    }
};
