// Backend/utils/autoRenewNotifications.js
//
// Emails for automatic renewal with a stored card (see
// services/subscriptionAutoRenew.service.js): the pre-charge notice, the
// receipt, a failed charge, retries exhausted, and a card about to expire.
// Rendered through the shared Ohnix layout (utils/emailTemplate.js).

import transporter, { isMailConfigured } from "./nodemailer.js";
import { buildEmail, emailLinks } from "./emailTemplate.js";

// The app route is /billing (App.jsx) - /dashboard/billing does not exist.
const billingUrl = () => emailLinks.app("/billing");

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

const send = async ({ to, subject, email }) => {
    if (!isMailConfigured() || !to) return;
    try {
        await transporter.sendMail({ from: `Ohnix <${process.env.SENDER_EMAIL}>`, to, subject, ...buildEmail(email) });
    } catch (err) {
        console.error("[auto-renew-email] Failed to send:", err?.message);
    }
};

const common = (en) => ({
    lang: en ? "en" : "es",
    category: en ? "Billing" : "Facturación",
    reason: en ? "Billing email for your Ohnix subscription." : "Correo de facturación de tu suscripción a Ohnix.",
});

export const notifyUpcomingAutoCharge = ({ user, subscription, amount, currency, chargeDate }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const date = formatDate(chargeDate, en);
    const plan = planLabel(subscription.scheduledPlan || subscription.plan);
    return send({
        to: user.email,
        subject: en ? `Your ${plan} plan renews on ${date}` : `Tu plan ${plan} se renueva el ${date}`,
        email: {
            ...common(en),
            tone: "info",
            badge: en ? "Upcoming renewal" : "Próxima renovación",
            preheader: en ? `We'll charge ${money} on ${date}. You don't need to do anything.` : `Cobraremos ${money} el ${date}. No tienes que hacer nada.`,
            title: en ? "Your plan renews soon" : "Tu plan se renueva pronto",
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: en ? "We'll renew your plan automatically. You don't need to do anything." : "Renovaremos tu plan automáticamente. No tienes que hacer nada.",
            blocks: [
                {
                    type: "details",
                    rows: [
                        ["Plan", plan, { bold: true }],
                        [en ? "Amount" : "Monto", money, { bold: true }],
                        [en ? "Charge date" : "Fecha de cobro", date],
                        [en ? "Card" : "Tarjeta", cardLabel(subscription)],
                    ],
                },
            ],
            cta: { label: en ? "Manage billing" : "Gestionar facturación", url: billingUrl() },
            footnote: en
                ? "To change your card or stop automatic renewal, do it in Billing before that date."
                : "Si quieres cambiar la tarjeta o desactivar la renovación automática, hazlo en Facturación antes de esa fecha.",
        },
    });
};

export const notifyAutoChargeSucceeded = ({ user, subscription, amount, currency, periodEndsAt, reactivated }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const plan = planLabel(subscription.plan);
    return send({
        to: user.email,
        subject: en ? `Payment received: your ${plan} plan was renewed` : `Pago recibido: tu plan ${plan} fue renovado`,
        email: {
            ...common(en),
            tone: "success",
            badge: en ? "Payment received" : "Pago recibido",
            preheader: en ? `${money} charged. Your plan is active until ${formatDate(periodEndsAt, en)}.` : `Cobramos ${money}. Tu plan está activo hasta el ${formatDate(periodEndsAt, en)}.`,
            title: en ? "Your plan was renewed" : "Tu plan fue renovado",
            intro: en ? "Thanks! We received your payment." : "¡Gracias! Recibimos tu pago.",
            blocks: [
                {
                    type: "details",
                    rows: [
                        ["Plan", plan, { bold: true }],
                        [en ? "Amount charged" : "Monto cobrado", money, { bold: true }],
                        [en ? "Card" : "Tarjeta", cardLabel(subscription)],
                        [en ? "Active until" : "Activo hasta", formatDate(periodEndsAt, en)],
                    ],
                },
                ...(reactivated
                    ? [{ type: "alert", tone: "success", text: en ? "Your account access has been restored." : "El acceso a tu cuenta fue restablecido." }]
                    : []),
            ],
            cta: { label: en ? "View billing" : "Ver facturación", url: billingUrl() },
        },
    });
};

export const notifyAutoChargeFailed = ({ user, subscription, amount, currency, nextAttemptAt, willPauseAt, requiresAction }) => {
    const en = isEnglish(user.preferredLanguage);
    const money = formatChargeAmount(amount, currency, en);
    const cause = requiresAction
        ? en
            ? "Your bank asked for an additional verification that can't be completed automatically."
            : "Tu banco pidió una verificación adicional que no se puede completar de forma automática."
        : en
          ? "The charge was declined by your bank."
          : "Tu banco rechazó el cobro.";
    return send({
        to: user.email,
        subject: en ? "We couldn't charge your card" : "No pudimos cobrar tu tarjeta",
        email: {
            ...common(en),
            tone: "danger",
            badge: en ? "Payment failed" : "Pago rechazado",
            preheader: en ? `We couldn't charge ${money}. Update your card to keep your plan active.` : `No pudimos cobrar ${money}. Actualiza tu tarjeta para mantener tu plan activo.`,
            title: en ? "We couldn't renew your plan" : "No pudimos renovar tu plan",
            greeting: en ? `Hi ${user.username || "there"},` : `Hola ${user.username || ""},`,
            intro: cause,
            blocks: [
                {
                    type: "details",
                    rows: [
                        [en ? "Amount" : "Monto", money, { bold: true }],
                        [en ? "Card" : "Tarjeta", cardLabel(subscription)],
                        [en ? "Next attempt" : "Próximo intento", nextAttemptAt ? formatDate(nextAttemptAt, en) : null],
                    ],
                },
                ...(willPauseAt
                    ? [{
                          type: "alert",
                          tone: "danger",
                          title: en ? "Avoid a pause" : "Evita la pausa",
                          text: en
                              ? `If it isn't resolved by ${formatDate(willPauseAt, en)}, access to your account will be paused. Your data stays safe.`
                              : `Si no se resuelve antes del ${formatDate(willPauseAt, en)}, el acceso a tu cuenta quedará en pausa. Tus datos se conservan.`,
                      }]
                    : []),
            ],
            cta: { label: en ? "Update card or pay now" : "Actualizar tarjeta o pagar ahora", url: billingUrl() },
        },
    });
};

export const notifyAutoChargeRetriesExhausted = ({ user, subscription }) => {
    const en = isEnglish(user.preferredLanguage);
    return send({
        to: user.email,
        subject: en ? "Automatic renewal turned off" : "Desactivamos la renovación automática",
        email: {
            ...common(en),
            tone: "warning",
            badge: en ? "Renewal off" : "Renovación desactivada",
            title: en ? "We stopped trying to charge your card" : "Dejamos de intentar cobrar tu tarjeta",
            intro: en
                ? `After several attempts we couldn't charge your ${cardLabel(subscription)}, so automatic renewal was turned off.`
                : `Después de varios intentos no pudimos cobrar tu ${cardLabel(subscription)}, así que desactivamos la renovación automática.`,
            blocks: [
                {
                    type: "alert",
                    tone: "info",
                    text: en
                        ? "Your data is safe. You can reactivate your plan any time from Billing."
                        : "Tus datos están a salvo. Puedes reactivar tu plan cuando quieras desde Facturación.",
                },
            ],
            cta: { label: en ? "Reactivate my plan" : "Reactivar mi plan", url: billingUrl() },
        },
    });
};

export const notifyCardExpiringSoon = ({ user, subscription, chargeDate }) => {
    const en = isEnglish(user.preferredLanguage);
    return send({
        to: user.email,
        subject: en ? "Your saved card is about to expire" : "Tu tarjeta guardada está por vencer",
        email: {
            ...common(en),
            tone: "warning",
            badge: en ? "Card expiring" : "Tarjeta por vencer",
            title: en ? "Update your card" : "Actualiza tu tarjeta",
            intro: en
                ? "Your saved card expires before your next renewal. Update it to avoid interruptions."
                : "Tu tarjeta guardada vence antes de tu próxima renovación. Actualízala para evitar interrupciones.",
            blocks: [
                {
                    type: "details",
                    rows: [
                        [en ? "Card" : "Tarjeta", cardLabel(subscription)],
                        [en ? "Next renewal" : "Próxima renovación", formatDate(chargeDate, en)],
                    ],
                },
            ],
            cta: { label: en ? "Update card" : "Actualizar tarjeta", url: billingUrl() },
        },
    });
};
