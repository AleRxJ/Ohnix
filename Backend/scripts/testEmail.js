/**
 * Test script: verifica que Brevo puede enviar correos con la API key actual.
 * Uso: node scripts/testEmail.js [destinatario@email.com]
 */
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.SENDER_EMAIL;
const recipient = process.argv[2] || senderEmail;

console.log("─────────────────────────────────────────");
console.log("  Ohnix — Test de correo (Brevo)");
console.log("─────────────────────────────────────────");
console.log(`  BREVO_API_KEY  : ${apiKey ? `✅ SET (${apiKey.length} chars)` : "❌ NO CONFIGURADO"}`);
console.log(`  SENDER_EMAIL   : ${senderEmail || "❌ NO CONFIGURADO"}`);
console.log(`  Destinatario   : ${recipient}`);
console.log("─────────────────────────────────────────\n");

if (!apiKey || apiKey === "change_me") {
    console.error("❌ BREVO_API_KEY no está configurado en .env");
    process.exit(1);
}
if (!senderEmail || senderEmail === "change_me@gmail.com") {
    console.error("❌ SENDER_EMAIL no está configurado en .env");
    process.exit(1);
}

console.log("Enviando correo de prueba...");

try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            sender: { name: "Ohnix", email: senderEmail },
            to: [{ email: recipient }],
            subject: "✅ Ohnix — Correo de prueba",
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px; background: #0b0b0b; border: 1px solid #29D8D5; border-radius: 12px;">
                    <h2 style="color: #29D8D5; margin: 0 0 12px;">✅ Correo de prueba exitoso</h2>
                    <p style="color: #e5e7eb; font-size: 15px;">Si ves este mensaje, la configuración de Brevo está funcionando correctamente.</p>
                    <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">Enviado desde: <strong>${senderEmail}</strong><br>Fecha: ${new Date().toLocaleString()}</p>
                    <hr style="border-color: #1d2733; margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 12px; text-align: center;">Ohnix by iTCycle</p>
                </div>
            `,
        }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        console.error(`❌ Error al enviar correo (HTTP ${response.status}):`);
        console.error(`   ${payload?.message || JSON.stringify(payload)}`);
        if (`${payload?.message || ""}`.toLowerCase().includes("sender")) {
            console.error("\n  Causa probable: el remitente/dominio no está verificado en Brevo.");
            console.error("  Verifícalo en https://app.brevo.com/senders/domain/list antes de enviar a destinatarios reales.");
        }
        process.exit(1);
    }

    console.log(`✅ Correo enviado exitosamente!`);
    console.log(`   MessageId: ${payload?.messageId}`);
    console.log(`   Revisa la bandeja de: ${recipient}`);
} catch (error) {
    console.error("❌ Error al enviar correo:");
    console.error(`   ${error.message}`);
    process.exit(1);
}
