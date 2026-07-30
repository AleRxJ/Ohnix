/**
 * Test script: verifica que nodemailer puede enviar correos con las credenciales actuales.
 * Uso: node scripts/testEmail.js [destinatario@email.com]
 */
import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

const senderEmail = process.env.info@itcycle.co;
const senderPassword = process.env.SENDER_PASSWORD;
const recipient = process.argv[2] || senderEmail;

console.log("─────────────────────────────────────────");
console.log("  Ohnix — Test de correo");
console.log("─────────────────────────────────────────");
console.log(`  info@itcycle.co   : ${senderEmail || "❌ NO CONFIGURADO"}`);
console.log(`  SENDER_PASSWORD: ${senderPassword ? `✅ SET (${senderPassword.length} chars)` : "❌ NO CONFIGURADO"}`);
console.log(`  Destinatario   : ${recipient}`);
console.log("─────────────────────────────────────────\n");

if (!senderEmail || senderEmail === "change_me@gmail.com") {
    console.error("❌ info@itcycle.co no está configurado en .env");
    process.exit(1);
}
if (!senderPassword || senderPassword === "change_me") {
    console.error("❌ SENDER_PASSWORD no está configurado en .env");
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: senderEmail,
        pass: senderPassword,
    },
});

console.log("Enviando correo de prueba...");

try {
    const info = await transporter.sendMail({
        from: senderEmail,
        to: recipient,
        subject: "✅ Ohnix — Correo de prueba",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px; background: #0b0b0b; border: 1px solid #29D8D5; border-radius: 12px;">
                <h2 style="color: #29D8D5; margin: 0 0 12px;">✅ Correo de prueba exitoso</h2>
                <p style="color: #e5e7eb; font-size: 15px;">Si ves este mensaje, la configuración de nodemailer está funcionando correctamente.</p>
                <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">Enviado desde: <strong>${senderEmail}</strong><br>Fecha: ${new Date().toLocaleString()}</p>
                <hr style="border-color: #1d2733; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px; text-align: center;">Ohnix by iTCycle</p>
            </div>
        `,
    });

    console.log(`✅ Correo enviado exitosamente!`);
    console.log(`   MessageId: ${info.messageId}`);
    console.log(`   Revisa la bandeja de: ${recipient}`);
} catch (error) {
    console.error("❌ Error al enviar correo:");
    console.error(`   ${error.message}`);
    if (error.code === "EAUTH") {
        console.error("\n  Causa probable: contraseña incorrecta o App Password no configurada.");
        console.error("  Asegúrate de usar una App Password de Google (16 caracteres).");
    }
    process.exit(1);
}
