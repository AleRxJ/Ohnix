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

/**
 * Fired alongside notifyAdminsDianTestMatrixRunFinished, once a run reaches
 * a terminal status - so the company owner (who may have started this
 * themselves via the self-service panel, or be waiting on one an Ohnix admin
 * started for them) finds out without keeping the tab open. Deliberately
 * lighter than the admin email: pass/fail + simple counts, no raw internal
 * DIAN codes or per-document detail - that's what "Ver detalle técnico" in
 * the self-service panel is for.
 */
export const notifyCompanyOwnerDianTestMatrixRunFinished = async ({ run, company, summary, ownerUser }) => {
    if (!isMailConfigured() || !ownerUser?.email) return;
    try {
        const statusLabel = STATUS_LABEL[run.status] || run.status;
        const passed = run.status === "completed" && run.passResult;
        const icon = passed ? "✅" : run.status === "failed" ? "⚠️" : "ℹ️";
        const resultLine = run.status === "completed"
            ? (passed
                ? "Tu prueba de habilitación fue <strong>aprobada</strong> - ya puedes solicitar la activación de Producción desde Configuración DIAN."
                : "Tu prueba de habilitación <strong>no fue aprobada</strong> - ninguna factura quedó aceptada. Revisa el detalle en Configuración DIAN e inténtalo de nuevo.")
            : run.status === "cancelled"
                ? "Cancelaste esta prueba de habilitación."
                : "Tu prueba de habilitación tuvo un error inesperado - nuestro equipo ya fue notificado.";

        const rows = [
            row("Test Set ID", `<span style="font-family:monospace;font-size:12px;">${run.testSetId}</span>`),
            row("Estado", statusLabel),
            row("Facturas (01)", `${summaryCount(summary, "invoice", "accepted")} de ${run.invoiceTarget} aceptadas`),
            row("Notas crédito (91)", `${summaryCount(summary, "creditNote", "accepted")} de ${run.creditNoteTarget} aceptadas`),
            row("Notas débito (92)", `${summaryCount(summary, "debitNote", "accepted")} de ${run.debitNoteTarget} aceptadas`),
        ].join("");

        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: ownerUser.email,
            subject: `[Ohnix] ${icon} Tu prueba de habilitación DIAN ${statusLabel.toLowerCase()}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 6px;">${icon} Prueba de habilitación DIAN — ${statusLabel}</h2>
                    <p style="color:#e5e7eb;font-size:14px;line-height:1.6;margin:0 0 16px;">Hola <strong>${ownerUser.username || ""}</strong>, ${resultLine}</p>
                    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${rows}</table>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send company owner notification:", err?.message);
    }
};

/**
 * Fired by the self-service "Solicitar activación de Producción" action -
 * the run already passed (at least 1 accepted invoice), but DIAN's own
 * approval of the habilitación happens on THEIR portal, which neither Ohnix
 * nor itcycle-api-dian can verify by API. This just turns a cold support
 * ticket into a pre-filled review: an admin still has to confirm DIAN's
 * approval by hand before flipping environment via itcycle-api-dian's
 * PUT dian-configuration (admin-only, unchanged by this feature).
 */
export const notifyAdminsDianProductionActivationRequested = async ({ run, company, requestedByUser }) => {
    if (!isMailConfigured()) return;
    try {
        const adminUsers = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
        const recipients = Array.from(new Set([
            ...adminUsers.map((a) => a.email?.toLowerCase()).filter(Boolean),
            ...parseAdditionalRecipients(),
        ]));
        if (!recipients.length) return;

        const rows = [
            row("Empresa", company?.name || run.companyId),
            row("Test Set ID", `<span style="font-family:monospace;font-size:12px;">${run.testSetId}</span>`),
            row("Run ID", `<span style="font-family:monospace;font-size:12px;">${run.id}</span>`),
            row("Resultado del run", run.passResult ? "✅ Aprobada" : "❌ No aprobada"),
            row("Solicitado por", requestedByUser?.email || requestedByUser?.username || "—"),
        ].join("");

        await transporter.sendMail({
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            bcc: recipients,
            subject: `[Ohnix] Solicitud de activación PRODUCCIÓN — ${company?.name || run.companyId}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                    <h2 style="color:#29D8D5;margin:0 0 6px;">🚀 Solicitud de activación de Producción</h2>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;">
                        Antes de activar, confirma en el portal de habilitación de la DIAN que esta empresa realmente fue aprobada - ni Ohnix ni itcycle-api-dian pueden verificar eso por API.
                        Si todo está en orden, activa vía itcycle-api-dian: <code>PUT /api/v1/admin/companies/&lt;itcycleCompanyId&gt;/dian-configuration</code> con <code>environment: "PRODUCTION"</code>.
                    </p>
                    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${rows}</table>
                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            `,
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send production-activation-requested notification:", err?.message);
    }
};
