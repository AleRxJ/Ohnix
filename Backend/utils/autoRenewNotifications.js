// Backend/utils/autoRenewNotifications.js
//
// Emails for automatic renewal with a stored card (see
// services/subscriptionAutoRenew.service.js): the pre-charge notice, the
// receipt, a failed charge, retries exhausted, and a card about to expire.
// Same dark brand shell as upgradeRequestNotifications.js.

import transporter, { isMailConfigured } from "./nodemailer.js";

const frontendBase = () => `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");
const billingUrl = () => `${frontendBase()}/dashboard/billing`;

const isEnglish = (locale) => `${locale || ""}`.toLowerCase().startsWith("en");

const planLabel = (plan) => (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "");

const formatDate = (date, en) =>
    new Date(date).toLocaleDateString(en ? "en-US" : "es-CO", { year: "numeric", month: "long", day: "numeric" });

// Stripe amounts are in cents (usd/eur); COP is zero-decimal everywhere in
// this codebase.
export const formatChargeAmount = (amount, currency, en) => {
    const cur = `${currency || "cop"}`.toUpperCase();
    const value = cur === "COP" ? amount : amount / 100;
    try {
        return new Intl.NumberFormat(en ? "en-US" : "es-CO", {
            style: "currency",
            currency: cur,
            maximumFractionDigits: cur === "COP" ? 0 : 2,
        }).format(value);
    } catch {
        return `${value} ${cur}`;
    }
};

const cardLabel = ({ cardBrand, cardLast4 }) =>
    cardLast4 ? `${cardBrand ? cardBrand.toUpperCase() : "Tarjeta"} •••• ${cardLast4}` : "";

const send = async ({ to, subject, title, color = "#29D8D5", body, cta, footnote }) => {
    if (!isMailConfigured() || !to) return;
    try {
        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to,
            subject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:${color};margin:0 0 12px;">${title}</h2>
                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;">${body}</p>
                    ${cta ? `<div style="text-align:center;margin:28px 0;">
                        <a href="${billingUrl()}" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${cta}</a>
                    </div>` : ""}
                    ${footnote ? `<p style="color:#9ca3af;font-size:13px;text-align:center;">${footnote}</p>` : ""}
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. Todos los derechos reservados.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[auto-renew-email] Failed to send:", err?.message);
    }
};

export const notifyUpcomingAutoCharge = ({ user, subscription, amount, currency, chargeDate }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const card = cardLabel(subscription);
    const date = formatDate(chargeDate, en);
    const plan = planLabel(subscription.scheduledPlan || subscription.plan);
    return send({
        to: user.email,
        subject: en
            ? `[Ohnix] Your ${plan} plan renews on ${date}`
            : `[Ohnix] Tu plan ${plan} se renueva el ${date}`,
        title: en ? "Upcoming automatic renewal" : "Próxima renovación automática",
        body: en
            ? `Hello <strong>${user.username || "there"}</strong>, on <strong>${date}</strong> we'll charge <strong>${money}</strong> to your <strong>${card}</strong> to renew your <strong>${plan}</strong> plan. You don't need to do anything.`
            : `Hola <strong>${user.username || ""}</strong>, el <strong>${date}</strong> cobraremos <strong>${money}</strong> a tu <strong>${card}</strong> para renovar tu plan <strong>${plan}</strong>. No tienes que hacer nada.`,
        cta: en ? "Manage billing" : "Gestionar facturación",
        footnote: en
            ? "To change your card or stop automatic renewal, go to Billing before that date."
            : "Si quieres cambiar la tarjeta o desactivar la renovación automática, hazlo en Facturación antes de esa fecha.",
    });
};

export const notifyAutoChargeSucceeded = ({ user, subscription, amount, currency, periodEndsAt, reactivated }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const plan = planLabel(subscription.plan);
    return send({
        to: user.email,
        subject: en ? `[Ohnix] Payment received - ${plan} plan renewed` : `[Ohnix] Pago recibido - plan ${plan} renovado`,
        title: en ? "Your plan was renewed" : "Tu plan fue renovado",
        color: "#22c55e",
        body: en
            ? `We charged <strong>${money}</strong> to your <strong>${cardLabel(subscription)}</strong>. Your <strong>${plan}</strong> plan is active until <strong>${formatDate(periodEndsAt, en)}</strong>.${reactivated ? " Your account access has been restored." : ""}`
            : `Cobramos <strong>${money}</strong> a tu <strong>${cardLabel(subscription)}</strong>. Tu plan <strong>${plan}</strong> está activo hasta el <strong>${formatDate(periodEndsAt, en)}</strong>.${reactivated ? " El acceso a tu cuenta fue restablecido." : ""}`,
        cta: en ? "View billing" : "Ver facturación",
    });
};

export const notifyAutoChargeFailed = ({ user, subscription, amount, currency, nextAttemptAt, willPauseAt, requiresAction }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const card = cardLabel(subscription);
    const retryLine = nextAttemptAt
        ? en
            ? ` We'll try again on <strong>${formatDate(nextAttemptAt, en)}</strong>.`
            : ` Volveremos a intentarlo el <strong>${formatDate(nextAttemptAt, en)}</strong>.`
        : "";
    const pauseLine = willPauseAt
        ? en
            ? ` If it isn't resolved by <strong>${formatDate(willPauseAt, en)}</strong>, access to your account will be paused.`
            : ` Si no se resuelve antes del <strong>${formatDate(willPauseAt, en)}</strong>, el acceso a tu cuenta quedará en pausa.`
        : "";
    const reason = requiresAction
        ? en
            ? "your bank asked for additional verification that can't be completed automatically"
            : "tu banco pidió una verificación adicional que no se puede completar de forma automática"
        : en
          ? "it was declined"
          : "fue rechazado";
    return send({
        to: user.email,
        subject: en ? "[Ohnix] We couldn't charge your card" : "[Ohnix] No pudimos cobrar tu tarjeta",
        title: en ? "Automatic payment failed" : "El cobro automático falló",
        color: "#ef4444",
        body: en
            ? `We tried to charge <strong>${money}</strong> to your <strong>${card}</strong> to renew your plan, but ${reason}.${retryLine}${pauseLine}`
            : `Intentamos cobrar <strong>${money}</strong> a tu <strong>${card}</strong> para renovar tu plan, pero ${reason}.${retryLine}${pauseLine}`,
        cta: en ? "Update card or pay now" : "Actualizar tarjeta o pagar ahora",
    });
};

export const notifyAutoChargeRetriesExhausted = ({ user, subscription }) => {
    const en = isEnglish(user.preferredLanguage);
    return send({
        to: user.email,
        subject: en ? "[Ohnix] Automatic renewal turned off" : "[Ohnix] Renovación automática desactivada",
        title: en ? "We stopped trying to charge your card" : "Dejamos de intentar cobrar tu tarjeta",
        color: "#f59e0b",
        body: en
            ? `After several attempts we couldn't charge your <strong>${cardLabel(subscription)}</strong>, so automatic renewal was turned off. Your data is safe - you can reactivate your plan any time from Billing.`
            : `Después de varios intentos no pudimos cobrar tu <strong>${cardLabel(subscription)}</strong>, así que desactivamos la renovación automática. Tus datos están a salvo: puedes reactivar tu plan cuando quieras desde Facturación.`,
        cta: en ? "Reactivate my plan" : "Reactivar mi plan",
    });
};

export const notifyCardExpiringSoon = ({ user, subscription, chargeDate }) => {
    const en = isEnglish(user.preferredLanguage);
    return send({
        to: user.email,
        subject: en ? "[Ohnix] Your saved card is about to expire" : "[Ohnix] Tu tarjeta guardada está por vencer",
        title: en ? "Update your card" : "Actualiza tu tarjeta",
        color: "#f59e0b",
        body: en
            ? `Your <strong>${cardLabel(subscription)}</strong> expires before your next renewal on <strong>${formatDate(chargeDate, en)}</strong>. Update it to avoid interruptions.`
            : `Tu <strong>${cardLabel(subscription)}</strong> vence antes de tu próxima renovación del <strong>${formatDate(chargeDate, en)}</strong>. Actualízala para evitar interrupciones.`,
        cta: en ? "Update card" : "Actualizar tarjeta",
    });
};
