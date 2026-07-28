import transporter from "./nodemailer.js";
import { prisma } from "../db/prisma.js";

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

        if (!recipients.length || !process.env.SENDER_EMAIL) {
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

        if (!process.env.SENDER_EMAIL) {
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
