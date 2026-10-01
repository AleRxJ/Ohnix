import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";
import { buildEmail, emailLinks, esc } from "./emailTemplate.js";

// Plan / account lifecycle emails - all through the shared Ohnix layout
// (utils/emailTemplate.js). Prices are deliberately NOT written in these
// emails: the canonical prices live on the pricing page (COP), and a
// hardcoded figure here drifts out of date.

const isEnglish = (locale) => `${locale || ""}`.toLowerCase().startsWith("en");
const planLabel = (plan) => (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "");
const formatDate = (date, en) => new Date(date).toLocaleDateString(en ? "en-US" : "es-CO", { year: "numeric", month: "long", day: "numeric" });
const formatDateTime = (date) => new Date(date || Date.now()).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
const from = () => `Ohnix <${process.env.SENDER_EMAIL}>`;
const billing = () => emailLinks.app("/billing");
const billingReason = (en) => (en ? "Billing email for your Ohnix subscription." : "Correo de facturación de tu suscripción a Ohnix.");

const sendSafe = async (label, mail) => {
    try {
        await transporter.sendMail({ from: from(), ...mail });
    } catch (err) {
        console.error(`[${label}] Failed to send:`, err?.message);
    }
};

// ─── Plan renewal reminder ────────────────────────────────────────────────────
export const notifyUserRenewalReminder = async ({ user, plan, endsAt, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const en = isEnglish(locale);
    const label = planLabel(plan);
    await sendSafe("renewal-reminder", {
        to: user.email,
        subject: en ? `Your ${label} plan expired: renew to keep full access` : `Tu plan ${label} venció: renueva para mantener el acceso`,
        ...buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Billing" : "Facturación",
            tone: "warning",
            badge: en ? "Plan expired" : "Plan vencido",
            preheader: en ? "You have a few days to renew before losing full access." : "Tienes unos días para renovar antes de perder el acceso completo.",
            title: en ? `Your ${label} plan expired` : `Tu plan ${label} venció`,
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: en
                ? "Your plan expired. You have a few days to renew before losing full access to your data and features."
                : "Tu plan venció. Tienes unos días para renovar antes de perder el acceso completo a tus datos y funcionalidades.",
            blocks: [
                { type: "details", rows: [["Plan", label, { bold: true }], [en ? "Expired on" : "Venció el", endsAt ? formatDate(endsAt, en) : null]] },
                { type: "alert", tone: "info", text: en ? "Your data is kept safe while you renew." : "Tus datos se conservan mientras renuevas." },
            ],
            cta: { label: en ? "Renew my plan" : "Renovar mi plan", url: billing() },
            footnote: en ? "Already renewed? You can ignore this email." : "¿Ya renovaste? Puedes ignorar este correo.",
            reason: billingReason(en),
        }),
    });
};

// ─── Trial ending soon ────────────────────────────────────────────────────
// Sent a few days before trialEndsAt so the user isn't blocked with no
// warning once the 14-day trial ends.
export const notifyUserTrialEndingSoon = async ({ user, trialEndsAt, daysLeft, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const en = isEnglish(locale);
    const date = formatDate(trialEndsAt, en);
    const days = en ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""}` : `${daysLeft} día${daysLeft !== 1 ? "s" : ""}`;
    await sendSafe("trial-ending", {
        to: user.email,
        subject: en ? `Your free trial ends in ${days}` : `Tu prueba gratuita termina en ${days}`,
        ...buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Billing" : "Facturación",
            tone: "warning",
            badge: en ? `${days} left` : `Quedan ${days}`,
            preheader: en ? `Your trial ends on ${date}. Choose a plan to keep using Ohnix.` : `Tu prueba termina el ${date}. Elige un plan para seguir usando Ohnix.`,
            title: en ? "Your free trial is ending soon" : "Tu prueba gratuita está por terminar",
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            introHtml: en
                ? `Your 14-day free trial ends on <strong>${esc(date)}</strong>. Choose a plan to keep using Ohnix without interruptions - everything you've set up stays as it is.`
                : `Tu prueba gratuita de 14 días termina el <strong>${esc(date)}</strong>. Elige un plan para seguir usando Ohnix sin interrupciones: todo lo que configuraste se mantiene.`,
            cta: { label: en ? "Choose my plan" : "Elegir mi plan", url: billing() },
            secondaryCta: { label: en ? "Compare plans" : "Comparar planes", url: emailLinks.app("/precios") },
            reason: billingReason(en),
        }),
    });
};

// ─── Plan activated confirmation ────────────────────────────────────────────
export const notifyUserPlanActivated = async ({ user, targetPlan, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const en = isEnglish(locale);
    const label = planLabel(targetPlan);
    await sendSafe("plan-activated", {
        to: user.email,
        subject: en ? `Your ${label} plan is now active` : `Tu plan ${label} ya está activo`,
        ...buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Billing" : "Facturación",
            tone: "success",
            badge: en ? "Plan active" : "Plan activo",
            preheader: en ? "Payment confirmed. Your new limits are available now." : "Pago confirmado. Tus nuevos límites ya están disponibles.",
            title: en ? `Your ${label} plan is active` : `Tu plan ${label} está activo`,
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: en
                ? "Your payment was confirmed and your new plan is active. Your new limits and features are available right away."
                : "Tu pago fue confirmado y tu nuevo plan ya está activo. Los nuevos límites y funcionalidades están disponibles de inmediato.",
            blocks: [{ type: "details", rows: [["Plan", label, { bold: true }], [en ? "Status" : "Estado", en ? "Active" : "Activo", { color: "#34d399", bold: true }]] }],
            cta: { label: en ? "Go to my account" : "Ir a mi cuenta", url: emailLinks.app("/dashboard") },
            reason: billingReason(en),
        }),
    });
};

// ─── Payment failed / rejected ───────────────────────────────────────────────
// `reason` mirrors the paymentStatus written to the request, so the copy
// never blames the user's card for a gateway-side technical error (or vice
// versa): a declined card needs "check your card", a gateway error needs
// "not your card's fault, try again".
const PAYMENT_FAILED_COPY = {
    rejected: {
        es: { cause: "Tu banco o la pasarela de pago rechazó el cobro.", advice: "Verifica los datos de tu tarjeta o los fondos disponibles y vuelve a intentarlo." },
        en: { cause: "Your bank or the payment gateway declined the charge.", advice: "Check your card details or available funds and try again." },
    },
    failed: {
        es: { cause: "Tuvimos un error técnico al procesar tu pago. No fue un problema de tu tarjeta.", advice: "Vuelve a intentarlo: lo más probable es que funcione en el siguiente intento." },
        en: { cause: "We hit a technical error processing your payment. It wasn't an issue with your card.", advice: "Try again: it will most likely go through on the next attempt." },
    },
    expired: {
        es: { cause: "Se agotó el tiempo para completar tu pago.", advice: "Puedes intentarlo de nuevo cuando quieras." },
        en: { cause: "The time window to complete your payment ran out.", advice: "You can try again anytime." },
    },
    cancelled: {
        es: { cause: "Cancelaste el pago antes de completarlo.", advice: "Puedes intentarlo de nuevo cuando quieras." },
        en: { cause: "You cancelled the payment before completing it.", advice: "You can try again anytime." },
    },
    default: {
        es: { cause: "No pudimos confirmar tu pago con nuestro proveedor de pagos.", advice: "Puedes intentarlo de nuevo con el mismo método u otro distinto." },
        en: { cause: "Our payment provider couldn't confirm your payment.", advice: "You can try again with the same or a different payment method." },
    },
};

export const notifyUserPaymentFailed = async ({ request, user, locale, reason }) => {
    if (!isMailConfigured() || !user?.email || !request?.targetPlan) return;
    const en = isEnglish(locale);
    const label = planLabel(request.targetPlan);
    const copy = (PAYMENT_FAILED_COPY[reason] || PAYMENT_FAILED_COPY.default)[en ? "en" : "es"];
    await sendSafe("payment-failed", {
        to: user.email,
        subject: en ? `We couldn't confirm your payment for the ${label} plan` : `No pudimos confirmar tu pago del plan ${label}`,
        ...buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Billing" : "Facturación",
            tone: "danger",
            badge: en ? "Payment not confirmed" : "Pago no confirmado",
            preheader: en ? "No charge was made. You can try again." : "No se hizo ningún cobro. Puedes intentarlo de nuevo.",
            title: en ? "Your payment didn't go through" : "Tu pago no se completó",
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: copy.cause,
            blocks: [
                { type: "details", rows: [[en ? "Plan" : "Plan", label, { bold: true }], [en ? "Charge" : "Cobro", en ? "None - nothing was charged" : "Ninguno: no se cobró nada", { color: "#34d399" }]] },
                { type: "paragraph", text: copy.advice },
            ],
            cta: { label: en ? "Try again" : "Intentar de nuevo", url: billing() },
            reason: billingReason(en),
        }),
    });
};

// ─── Email verified confirmation ─────────────────────────────────────────────
export const notifyUserEmailVerified = async ({ user, locale }) => {
    if (!isMailConfigured() || !user?.email) return;
    const en = isEnglish(locale);
    await sendSafe("email-verified", {
        to: user.email,
        subject: en ? "Your email is verified" : "Tu correo quedó verificado",
        ...buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Account" : "Cuenta",
            tone: "success",
            badge: en ? "Verified" : "Verificado",
            title: en ? "Your account is active" : "Tu cuenta está activa",
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: en ? "Your email was verified successfully. Your account is now fully active." : "Tu correo fue verificado con éxito. Tu cuenta ya está completamente activa.",
            cta: { label: en ? "Go to my account" : "Ir a mi cuenta", url: emailLinks.app("/dashboard") },
            reason: en ? "Security email sent to the owner of this Ohnix account." : "Correo de seguridad enviado al titular de esta cuenta de Ohnix.",
        }),
    });
};

// ─── Internal (Ohnix team) alerts ─────────────────────────────────────────────
// Always Spanish: these go to Ohnix's own admins, never follow the customer's
// language (an English-browser signup used to send admins an English alert).
const parseAdditionalRecipients = () =>
    (process.env.UPGRADE_ALERT_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const adminRecipients = async () => {
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    return Array.from(new Set([...admins.map((a) => a.email?.toLowerCase()).filter(Boolean), ...parseAdditionalRecipients()]));
};

const INTERNAL_REASON = "Alerta interna para el equipo de Ohnix.";

// ─── New user registered → admin notification ────────────────────────────────
export const notifyAdminsNewUserRegistered = async ({ user }) => {
    if (!isMailConfigured() || !user?.email) return;
    try {
        const recipients = await adminRecipients();
        if (!recipients.length) return;
        await transporter.sendMail({
            from: from(),
            bcc: recipients,
            subject: `[Interno] Nuevo usuario: ${user.username}`,
            ...buildEmail({
                lang: "es",
                category: "Interno",
                tone: "info",
                badge: "Nuevo registro",
                title: "Se registró un nuevo usuario",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Usuario", user.username, { bold: true }],
                            ["Correo", user.email],
                            ["Plan", user.plan || "starter"],
                            ["Fecha", formatDateTime()],
                        ],
                    },
                ],
                cta: { label: "Abrir administración", url: emailLinks.app("/admin/management") },
                reason: INTERNAL_REASON,
            }),
        });
    } catch (err) {
        console.error("[new-user-admin] Failed to send notification:", err?.message);
    }
};

const decisionCopy = {
    approved: { es: "aprobada", en: "approved", tone: "success" },
    rejected: { es: "rechazada", en: "rejected", tone: "danger" },
    closed: { es: "activada", en: "activated", tone: "success" },
};

export const notifyAdminsUpgradeRequestCreated = async ({ request, user, source = "app" }) => {
    try {
        if (!request?.id || !user?.email) return;
        const recipients = await adminRecipients();
        if (!recipients.length || !isMailConfigured()) {
            if (process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true") {
                console.warn("[upgrade-notify] Admin email skipped: mail not configured or no recipients.");
            }
            return;
        }
        await transporter.sendMail({
            from: from(),
            bcc: recipients,
            subject: `[Interno] Solicitud de cambio de plan: ${request.currentPlan} → ${request.targetPlan}`,
            ...buildEmail({
                lang: "es",
                category: "Interno",
                tone: "info",
                badge: "Por revisar",
                preheader: `${user.username || user.email} quiere pasar de ${request.currentPlan} a ${request.targetPlan}.`,
                title: "Nueva solicitud de cambio de plan",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Usuario", `${user.username || "—"} (${user.email})`, { bold: true }],
                            ["Plan actual", request.currentPlan],
                            ["Plan solicitado", request.targetPlan, { bold: true, color: "#29D8D5" }],
                            ["Origen", source],
                            ["Creada", formatDateTime(request.createdAt)],
                            ["ID de solicitud", request.id],
                        ],
                    },
                    ...(request.notes ? [{ type: "alert", tone: "info", title: "Notas del usuario", text: request.notes }] : []),
                ],
                cta: { label: "Revisar solicitud", url: emailLinks.app("/admin/subscriptions") },
                reason: INTERNAL_REASON,
            }),
        });
    } catch (error) {
        console.error("Failed to send upgrade request admin notification:", error);
    }
};

export const notifyUserUpgradeRequestResolved = async ({ request, user, actedBy = "admin", locale }) => {
    try {
        if (!request?.id || !user?.email) return;
        if (!["approved", "rejected", "closed"].includes(request.status)) return;
        if (!isMailConfigured()) {
            if (process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true") {
                console.warn("[upgrade-notify] User resolution email skipped: mail not configured.");
            }
            return;
        }
        const en = isEnglish(locale || process.env.DEFAULT_EMAIL_LOCALE);
        const decision = decisionCopy[request.status];
        const word = decision[en ? "en" : "es"];
        await transporter.sendMail({
            from: from(),
            to: user.email,
            subject: en ? `Your plan change request was ${word}` : `Tu solicitud de cambio de plan fue ${word}`,
            ...buildEmail({
                lang: en ? "en" : "es",
                category: en ? "Billing" : "Facturación",
                tone: decision.tone,
                badge: en ? `Request ${word}` : `Solicitud ${word}`,
                title: en ? `Your plan change request was ${word}` : `Tu solicitud de cambio de plan fue ${word}`,
                greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
                intro: en ? "Here are the details of the decision:" : "Este es el detalle de la decisión:",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            [en ? "Current plan" : "Plan actual", request.currentPlan],
                            [en ? "Requested plan" : "Plan solicitado", request.targetPlan, { bold: true }],
                            [en ? "Decision" : "Decisión", word, { bold: true, color: decision.tone === "danger" ? "#fb7185" : "#34d399" }],
                            [en ? "Date" : "Fecha", formatDateTime(request.updatedAt)],
                            [en ? "Reviewed by" : "Revisada por", actedBy],
                        ],
                    },
                    ...(request.adminResponse ? [{ type: "alert", tone: "info", title: en ? "Message from our team" : "Mensaje de nuestro equipo", text: request.adminResponse }] : []),
                ],
                cta: { label: en ? "View billing" : "Ver facturación", url: billing() },
                reason: billingReason(en),
            }),
        });
    } catch (error) {
        console.error("Failed to send upgrade resolution notification to user:", error);
    }
};
