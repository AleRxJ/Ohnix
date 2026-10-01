import transporter, { isMailConfigured } from "./nodemailer.js";
import { prisma } from "../db/prisma.js";
import { buildEmail, emailLinks, esc } from "./emailTemplate.js";

// DIAN habilitación test-set emails, through the shared Ohnix layout
// (utils/emailTemplate.js). Admin recipients: every "admin" user plus an
// optional extra list from env for someone who monitors this without a full
// admin account.
const parseAdditionalRecipients = () =>
    (process.env.DIAN_TEST_MATRIX_ALERT_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const adminRecipients = async () => {
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    return Array.from(new Set([...admins.map((a) => a.email?.toLowerCase()).filter(Boolean), ...parseAdditionalRecipients()]));
};

const STATUS_LABEL = { completed: "Completada", failed: "Falló", cancelled: "Cancelada" };
const summaryCount = (summary, type, status) => summary?.[type]?.[status] || 0;
const mono = (value) => `<span style="font-family:'Courier New',monospace;font-size:12px;">${esc(value)}</span>`;
const from = () => `Ohnix <${process.env.SENDER_EMAIL}>`;
const INTERNAL_REASON = "Alerta interna para el equipo de Ohnix.";

const runTone = (run) => (run.status === "completed" ? (run.passResult ? "success" : "danger") : run.status === "failed" ? "danger" : "info");

/**
 * Fired by dianTestMatrix.service.js's worker once a run reaches a terminal
 * status (completed/failed/cancelled) - these runs can take a while (up to
 * ~50 documents x several minutes of polling each), so this closes the loop
 * instead of someone keeping the admin tab open.
 */
export const notifyAdminsDianTestMatrixRunFinished = async ({ run, company, summary }) => {
    if (!isMailConfigured()) return;
    try {
        const recipients = await adminRecipients();
        if (!recipients.length) return;
        const statusLabel = STATUS_LABEL[run.status] || run.status;
        const companyName = company?.name || run.companyId;
        const result = run.status === "completed" ? (run.passResult ? "Aprobada (al menos 1 factura aceptada)" : "No aprobada (ninguna factura aceptada)") : "—";
        const line = (type, target) =>
            `${summaryCount(summary, type, "accepted")} aceptadas · ${summaryCount(summary, type, "rejected")} rechazadas · ${summaryCount(summary, type, "error")} con error (de ${target})`;

        await transporter.sendMail({
            from: from(),
            bcc: recipients,
            subject: `[Interno] Set de pruebas DIAN ${statusLabel.toLowerCase()}: ${companyName}`,
            ...buildEmail({
                lang: "es",
                category: "Interno · DIAN",
                tone: runTone(run),
                badge: `Set de pruebas ${statusLabel.toLowerCase()}`,
                preheader: `${companyName}: ${result}`,
                title: `Set de pruebas DIAN ${statusLabel.toLowerCase()}`,
                intro: "Resultado del lote de habilitación (30 facturas, 10 notas débito y 10 notas crédito) contra el sandbox de la DIAN.",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Empresa", companyName, { bold: true }],
                            ["Resultado", result, { bold: true, color: run.passResult ? "#34d399" : "#fb7185" }],
                            ["Facturas (01)", line("invoice", run.invoiceTarget)],
                            ["Notas crédito (91)", line("creditNote", run.creditNoteTarget)],
                            ["Notas débito (92)", line("debitNote", run.debitNoteTarget)],
                            ["Test Set ID", mono(run.testSetId), { html: true }],
                        ],
                    },
                    ...(run.errorMessage ? [{ type: "alert", tone: "danger", title: "Error", text: run.errorMessage }] : []),
                ],
                cta: { label: "Ver el detalle", url: emailLinks.app("/admin/dian-test-matrix") },
                reason: INTERNAL_REASON,
            }),
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send admin notification:", err?.message);
    }
};

/**
 * Fired alongside the admin email, so the company owner finds out without
 * keeping the tab open. Deliberately lighter than the admin email: pass/fail
 * and simple counts, no raw DIAN codes - "Ver detalle técnico" in the
 * self-service panel is where that lives.
 */
export const notifyCompanyOwnerDianTestMatrixRunFinished = async ({ run, summary, ownerUser }) => {
    if (!isMailConfigured() || !ownerUser?.email) return;
    try {
        const statusLabel = STATUS_LABEL[run.status] || run.status;
        const passed = run.status === "completed" && run.passResult;
        const title =
            run.status === "completed"
                ? passed
                    ? "¡Aprobaste la prueba de habilitación DIAN!"
                    : "Tu prueba de habilitación DIAN no fue aprobada"
                : run.status === "cancelled"
                  ? "Cancelaste la prueba de habilitación DIAN"
                  : "Tu prueba de habilitación DIAN tuvo un error";
        const intro =
            run.status === "completed"
                ? passed
                    ? "Ya puedes solicitar la activación de Producción desde Configuración DIAN."
                    : "Ninguna factura quedó aceptada. Revisa el detalle en Configuración DIAN e inténtalo de nuevo."
                : run.status === "cancelled"
                  ? "La prueba se detuvo. Puedes iniciarla de nuevo cuando quieras."
                  : "Ocurrió un error inesperado. Nuestro equipo ya fue notificado y te ayudará a resolverlo.";

        await transporter.sendMail({
            from: from(),
            to: ownerUser.email,
            subject: passed ? "Aprobaste la prueba de habilitación DIAN" : `Tu prueba de habilitación DIAN: ${statusLabel.toLowerCase()}`,
            ...buildEmail({
                lang: "es",
                category: "Facturación DIAN",
                tone: runTone(run),
                badge: passed ? "Aprobada" : statusLabel,
                title,
                greeting: `Hola ${ownerUser.username || ""},`,
                intro,
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Facturas (01)", `${summaryCount(summary, "invoice", "accepted")} de ${run.invoiceTarget} aceptadas`],
                            ["Notas crédito (91)", `${summaryCount(summary, "creditNote", "accepted")} de ${run.creditNoteTarget} aceptadas`],
                            ["Notas débito (92)", `${summaryCount(summary, "debitNote", "accepted")} de ${run.debitNoteTarget} aceptadas`],
                            ["Test Set ID", mono(run.testSetId), { html: true }],
                        ],
                    },
                ],
                cta: { label: passed ? "Solicitar activación de Producción" : "Ir a Configuración DIAN", url: emailLinks.app("/fiscal-setup") },
                reason: "Recibes este correo porque tu empresa está en proceso de habilitación DIAN en Ohnix.",
            }),
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send company owner notification:", err?.message);
    }
};

/**
 * Fired by the self-service "Solicitar activación de Producción" action. DIAN
 * approves the habilitación on THEIR portal, which neither Ohnix nor
 * itcycle-api-dian can verify by API - this turns a cold support ticket into
 * a pre-filled review; an admin still confirms by hand before switching the
 * environment in itcycle-api-dian.
 */
export const notifyAdminsDianProductionActivationRequested = async ({ run, company, requestedByUser }) => {
    if (!isMailConfigured()) return;
    try {
        const recipients = await adminRecipients();
        if (!recipients.length) return;
        const companyName = company?.name || run.companyId;
        await transporter.sendMail({
            from: from(),
            bcc: recipients,
            subject: `[Interno] Solicitud de activación a PRODUCCIÓN: ${companyName}`,
            ...buildEmail({
                lang: "es",
                category: "Interno · DIAN",
                tone: "warning",
                badge: "Acción requerida",
                preheader: `${companyName} pidió activar la facturación DIAN en Producción.`,
                title: "Solicitud de activación de Producción",
                blocks: [
                    {
                        type: "details",
                        rows: [
                            ["Empresa", companyName, { bold: true }],
                            ["Resultado del set", run.passResult ? "Aprobado" : "No aprobado", { bold: true, color: run.passResult ? "#34d399" : "#fb7185" }],
                            ["Solicitado por", requestedByUser?.email || requestedByUser?.username || "—"],
                            ["Test Set ID", mono(run.testSetId), { html: true }],
                            ["Run ID", mono(run.id), { html: true }],
                        ],
                    },
                    {
                        type: "alert",
                        tone: "warning",
                        title: "Antes de activar",
                        html: `Confirma en el portal de habilitación de la DIAN que esta empresa sí fue aprobada: ni Ohnix ni itcycle-api-dian pueden verificarlo por API. Luego activa en itcycle-api-dian con ${mono('PUT /api/v1/admin/companies/<itcycleCompanyId>/dian-configuration')} y ${mono('environment: "PRODUCTION"')}.`,
                    },
                ],
                cta: { label: "Ver el set de pruebas", url: emailLinks.app("/admin/dian-test-matrix") },
                reason: INTERNAL_REASON,
            }),
        });
    } catch (err) {
        console.error("[dian-test-matrix-alert] Failed to send production-activation-requested notification:", err?.message);
    }
};
