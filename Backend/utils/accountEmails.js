import { buildEmail, emailLinks } from "./emailTemplate.js";

// "Your account is ready, choose your password" - for accounts Ohnix created
// on someone's behalf (demo handover, guest certificate checkout). Not the
// "reset your password" email: this person never had a password. The button
// opens /reset-password with the email and code prefilled (ResetPassword.jsx
// reads ?email=&code=), because requesting a new code there would replace
// this one.
const VARIANTS = {
    demo: {
        title: "Tu cuenta de Ohnix está lista",
        badge: "Cuenta lista",
        intro: (companyName) =>
            `Preparamos una cuenta para ${companyName || "tu negocio"} con tus productos ya cargados, para que la veas funcionando desde el primer día.`,
        next: [
            "Crea tu contraseña con el botón de abajo.",
            "Revisa tus productos y haz tu primera venta desde la Caja.",
            "Tienes 14 días de prueba, contados desde hoy.",
        ],
    },
    certificate: {
        title: "Tu cuenta y tu certificado digital",
        badge: "Cuenta creada",
        intro: () => "Creamos tu cuenta de Ohnix con tu compra del certificado digital. Crea tu contraseña para entrar cuando quieras y seguir el proceso.",
        next: [
            "Crea tu contraseña con el botón de abajo.",
            "Sigue el estado de tu certificado desde Configuración DIAN.",
            "Cuando esté listo, activa tu facturación electrónica.",
        ],
    },
};

export const accountAccessEmail = ({ variant = "demo", username, email, otp, companyName, validHours = 48 }) => {
    const v = VARIANTS[variant] || VARIANTS.demo;
    const link = emailLinks.app(`/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(otp)}`);
    return buildEmail({
            lang: "es",
            category: "Cuenta",
            tone: "success",
            badge: v.badge,
            preheader: `Crea tu contraseña para entrar. El enlace vence en ${validHours} horas.`,
            title: v.title,
            greeting: `Hola ${username || ""},`,
            intro: v.intro(companyName),
            blocks: [
                { type: "heading", text: "Qué sigue" },
                { type: "list", items: v.next },
                { type: "details", rows: [["Tu usuario", email, { bold: true }], ["Vence", `En ${validHours} horas`]] },
            ],
            cta: { label: "Crear mi contraseña", url: link },
            footnote: `¿El botón no funciona? Copia este enlace en tu navegador: ${link}`,
            reason: "Recibes este correo porque se creó una cuenta de Ohnix con esta dirección.",
    });
};
