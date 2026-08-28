import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";

// Same recipient pattern as notifyAdminsNewFirmaPassValidations
// (firmaPassNotifications.js): every user with role "admin", plus an
// optional extra list from env for someone who monitors this without a full
// admin account.
const parseAdditionalRecipients = () => {
    const raw = process.env.DIAN_TEST_MATRIX_ALERT_EMAILS || "";
    return raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
};

const STATUS_LABEL = { completed: "Completada", failed: "Falló", cancelled: "Cancelada" };

const row = (label, value) => `
    <tr>
        <td style="width:30%;padding:10px 12px;border:1px solid #1d2733;border-right:none;border-radius:10px 0 0 10px;color:#9ca3af;font-size:13px;">${label}</td>
        <td style="padding:10px 12px;border:1px solid #1d2733;border-radius:0 10px 10px 0;color:#e5e7eb;font-size:13px;">${value}</td>
    </tr>
`;

const summaryCount = (summary, type, status) => summary?.[type]?.[status] || 0;

/**
 * Fired by dianTestMatrix.service.js's worker once a run reaches a terminal
 * status (completed/failed/cancelled) - an admin triggers these runs and
 * they can take a while (up to ~50 documents x several minutes of polling
 * each), so this is the notification that closes the loop instead of
 * requiring someone to keep the admin tab open and poll it themselves.
 */
export const notifyAdminsDianTestMatrixRunFinished = async ({ run, company, summary }) => {
    if (!isMailConfigured()) return;
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

        const statusLabel = STATUS_LABEL[run.status] || run.status;
        const passLabel = run.status === "completed"
            ? (run.passResult ? "✅ Aprobada (al menos 1 factura aceptada)" : "❌ No aprobada (ninguna factura aceptada)")
            : "—";

        const rows = [
            row("Empresa", company?.name || run.companyId),
            row("Test Set ID", `<span style="font-family:monospace;font-size:12px;">${run.testSetId}</span>`),
            row("Estado", statusLabel),
            row("Resultado", passLabel),
            row("Facturas (01)", `${summaryCount(summary, "invoice", "accepted")} aceptadas / ${summaryCount(summary, "invoice", "rejected")} rechazadas / ${summaryCount(summary, "invoice", "error")} con error de ${run.invoiceTarget}`),
            row("Notas crédito (91)", `${summaryCount(summary, "creditNote", "accepted")} aceptadas / ${summaryCount(summary, "creditNote", "rejected")} rechazadas / ${summaryCount(summary, "creditNote", "error")} con error de ${run.creditNoteTarget}`),
            row("Notas débito (92)", `${summaryCount(summary, "debitNote", "accepted")} aceptadas / ${summaryCount(summary, "debitNote", "rejected")} rechazadas / ${summaryCount(summary, "debitNote", "error")} con error de ${run.debitNoteTarget}`),
        ].join("");

        const icon = run.status === "completed" && run.passResult ? "✅" : run.status === "failed" ? "⚠️" : "ℹ️";

        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            bcc: recipients,
            subject: `[Ohnix] ${icon} Set de pruebas DIAN ${statusLabel.toLowerCase()} — ${company?.name || run.companyId}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 6px;">${icon} Set de pruebas DIAN — ${statusLabel}</h2>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;">
                        Resultado del lote de habilitación (30 facturas, 10 notas débito, 10 notas crédito) contra el sandbox real de la DIAN.
                    </p>
                    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${rows}</table>
                    ${run.errorMessage ? `<p style="color:#f87171;font-size:13px;margin:16px 0 0;"><strong>Error:</strong> ${run.errorMessage}</p>` : ""}
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send admin notification:", err?.message);
    }
};
