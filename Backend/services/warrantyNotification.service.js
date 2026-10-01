import { prisma } from "../db/prisma.js";
import { getProvider } from "../notificationProviders/registry.js";
import { renderTemplate } from "../utils/warrantyTemplateRenderer.js";
import { buildEmail, companyBrand } from "../utils/emailTemplate.js";
import { DEFAULT_EMAIL_TEMPLATES, DEFAULT_WHATSAPP_TEMPLATES, GENERIC_UPDATE_TEMPLATE } from "../utils/warrantyNotificationDefaults.js";

const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 1440];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

// No address field exists anywhere on User/Company today (see the schema
// exploration this module's design was based on) - empresa_direccion
// renders empty rather than forcing a new column onto a shared model for a
// single template variable a merchant can simply leave out of their text.
const getBusinessProfile = async (accountId) => {
    const user = await prisma.user.findUnique({
        where: { id: accountId },
        select: { username: true, company: { select: { name: true, legalName: true, phone: true } } },
    });
    return {
        name: user?.company?.name || user?.company?.legalName || user?.username || "Ohnix",
        phone: user?.company?.phone || "",
        address: "",
    };
};

// The merchant writes these bodies as plain text (see
// warrantyNotificationDefaults.js), so they go in escaped, inside the shared
// layout in company-brand mode - the customer hears from the business, not
// from Ohnix.
const buildWarrantyEmail = async (accountId, subject, body) => {
    const user = await prisma.user.findUnique({
        where: { id: accountId },
        select: { username: true, company: { select: { name: true, legalName: true, contactEmail: true, logoUrl: true, pdfAccentColor: true } } },
    });
    const brand = { ...companyBrand(user?.company, user?.username || "Ohnix"), name: user?.company?.name || user?.company?.legalName || user?.username || "Ohnix" };
    return {
        fromName: brand.name,
        ...buildEmail({
        lang: "es",
        brand,
        category: "Garantía",
        preheader: subject || "",
        title: subject || "Actualización de tu garantía",
        blocks: [{ type: "paragraph", text: body || "" }],
        reason: `Recibes este correo porque tienes una garantía registrada con ${brand.name}.`,
        }),
    };
};

const formatDate = (date) => (date ? new Date(date).toLocaleDateString("es-CO") : "");

const buildTemplateVariables = (warranty, business) => ({
    cliente_nombre: warranty.customerNameSnapshot,
    empresa_nombre: business.name,
    producto_nombre: warranty.productNameSnapshot,
    garantia_id: warranty.warrantyNumber,
    fecha_compra: formatDate(warranty.purchaseDate),
    fecha_vencimiento: formatDate(warranty.dueDate),
    numero_factura: warranty.invoiceNoSnapshot || "",
    estado_garantia: warranty.status,
    empresa_telefono: business.phone,
    empresa_direccion: business.address,
});

// Live contact info (spec section 12: use the customer's CURRENT phone/
// email/whatsapp to actually reach them, even though the warranty's own
// "*Snapshot" fields freeze what it was at registration for audit).
// Falls back to the warranty's snapshot if the customer row is gone.
const resolveCustomerChannels = async (warranty) => {
    const customer = await prisma.customer.findUnique({ where: { id: warranty.customerId } });
    if (!customer) {
        return { email: warranty.customerEmailSnapshot, whatsapp: warranty.customerWhatsappSnapshot || warranty.customerPhoneSnapshot };
    }
    return { email: customer.email || null, whatsapp: customer.whatsapp || customer.phone || null };
};

const getTemplateRow = async (accountId, event, channel) =>
    prisma.warrantyNotificationTemplate.findUnique({
        where: { createdById_event_channel: { createdById: accountId, event, channel } },
    });

const resolveTemplate = async (accountId, event, channel, { manual = false } = {}) => {
    const row = await getTemplateRow(accountId, event, channel);
    if (row) return row;

    const defaults = channel === "email" ? DEFAULT_EMAIL_TEMPLATES : { [event]: { body: DEFAULT_WHATSAPP_TEMPLATES[event] } };
    // A manual send always has something to say even for a status with no
    // dedicated default copy (e.g. "in_review") - an automatic notification
    // for a non-notifiable status should never happen in the first place
    // (see NOTIFIABLE_EVENTS), so it stays strict (returns null) instead.
    const fallback = defaults[event] || (manual ? GENERIC_UPDATE_TEMPLATE : null);
    if (!fallback) return null;
    return {
        isEnabled: true,
        subject: fallback.subject || null,
        bodyTemplate: fallback.body,
        metaTemplateName: null,
        metaTemplateLanguage: "es",
    };
};

const sendViaChannel = async ({ warranty, channel, template, variables, recipient, eventTrigger, triggeredById }) => {
    const communication = await prisma.warrantyCommunication.create({
        data: {
            warrantyId: warranty.id,
            channel,
            eventTrigger,
            templateKey: `${eventTrigger}:${channel}`,
            recipient,
            subject: channel === "email" ? renderTemplate(template.subject, variables) : null,
            body: renderTemplate(template.bodyTemplate, variables),
            triggeredById: triggeredById || null,
        },
    });

    const provider = getProvider(channel);
    const result =
        channel === "email"
            ? await provider.send({ to: recipient, subject: communication.subject, ...(await buildWarrantyEmail(warranty.createdById, communication.subject, communication.body)) })
            : await provider.send({
                  to: recipient,
                  templateName: template.metaTemplateName,
                  templateLanguage: template.metaTemplateLanguage || "es",
                  // Phase 1: no account has an approved Meta template yet, so
                  // there's nothing meaningful to map variables to - see
                  // notificationProviders/whatsappProvider.js.
                  params: [],
              });

    await prisma.warrantyCommunication.update({
        where: { id: communication.id },
        data: result.sent
            ? { status: "sent", providerMessageId: result.providerMessageId || null }
            : {
                  status: "failed",
                  errorMessage: result.error || "Unknown error",
                  attempts: 1,
                  nextAttemptAt: new Date(Date.now() + BACKOFF_MINUTES[0] * 60_000),
              },
    });

    return { ...result, communicationId: communication.id };
};

// Orchestrates one notification attempt for a Warranty event - the
// event-driven "WarrantyCreated"/"WarrantyStatusChanged" hooks from the spec
// (section 17), called fire-and-forget right after the triggering Prisma
// write (see warranty.service.js), same idiom as
// webhookDispatch.service.js#enqueueWebhookEvent.
//
// `channels` (manual send only) is an explicit ordered list the merchant
// picked in the UI - when omitted (automatic), the fallback rules from
// section 11 apply: try WhatsApp first, fall back to email if WhatsApp is
// unavailable/fails, and record a "no channel available" event if neither
// works.
export const notifyWarrantyEvent = async (warranty, eventKey, { manual = false, actorId = null, channels = null } = {}) => {
    if (!manual) {
        // De-dupes an automatic notification per (warranty, event) - a
        // retried status-change request must never send the customer the
        // same update twice (spec section 18). Manual sends are
        // intentionally repeatable and skip this guard.
        try {
            await prisma.idempotencyKey.create({
                data: { accountId: warranty.createdById, scope: "warranty.notify", key: `${warranty.id}:${eventKey}`, status: "completed" },
            });
        } catch (error) {
            if (error.code === "P2002") return { skipped: "duplicate" };
            throw error;
        }
    }

    const [business, liveChannels] = await Promise.all([getBusinessProfile(warranty.createdById), resolveCustomerChannels(warranty)]);
    const variables = buildTemplateVariables(warranty, business);

    const providerAvailability = {
        whatsapp: Boolean(liveChannels.whatsapp) && getProvider("whatsapp").isConfigured(),
        email: Boolean(liveChannels.email) && getProvider("email").isConfigured(),
    };

    const attemptChannel = async (channel) => {
        const template = await resolveTemplate(warranty.createdById, eventKey, channel, { manual });
        if (!template) return { attempted: false };
        if (!manual && !template.isEnabled) return { attempted: false, disabled: true };

        const recipient = liveChannels[channel];
        if (!recipient) return { attempted: false };

        const result = await sendViaChannel({
            warranty,
            channel,
            template,
            variables,
            recipient,
            eventTrigger: manual ? "manual" : eventKey,
            triggeredById: actorId,
        });
        return { attempted: true, ...result };
    };

    const order = channels?.length ? channels : ["whatsapp", "email"];
    const results = {};
    let anySent = false;

    for (const channel of order) {
        if (!providerAvailability[channel] && !manual) continue;
        const outcome = await attemptChannel(channel);
        results[channel] = outcome;
        if (outcome.sent) anySent = true;
        // Automatic fallback (section 11): only keep trying the next
        // channel if this one wasn't actually attempted/sent. A manual send
        // with an explicit channel list always tries every requested
        // channel, since that's the merchant's deliberate choice.
        if (!manual && (outcome.sent || channels?.length)) break;
    }

    if (!manual && !anySent) {
        await prisma.warrantyEvent.create({
            data: {
                warrantyId: warranty.id,
                eventType: "no_channel_available",
                payload: { eventKey, availability: providerAvailability },
            },
        });
    }

    return results;
};

// Retries WarrantyCommunication rows that failed and are due for another
// attempt - same backoff sweep pattern as
// webhookDispatch.service.js#sweepDueDeliveries, run every minute by
// warrantyNotificationRetryScheduler.js.
export const sweepDueWarrantyCommunications = async (limit = 50) => {
    const due = await prisma.warrantyCommunication.findMany({
        where: { status: "failed", nextAttemptAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
        include: { warranty: true },
        take: limit,
        orderBy: { nextAttemptAt: "asc" },
    });

    for (const communication of due) {
        const provider = getProvider(communication.channel);
        const result =
            communication.channel === "email"
                ? await provider.send({
                      to: communication.recipient,
                      subject: communication.subject,
                      ...(await buildWarrantyEmail(communication.warranty.createdById, communication.subject, communication.body)),
                  })
                : await provider.send({ to: communication.recipient, templateName: null, params: [] });

        const attempts = communication.attempts + 1;
        const backoffMinutes = BACKOFF_MINUTES[attempts - 1];
        const exhausted = backoffMinutes === undefined;

        await prisma.warrantyCommunication
            .update({
                where: { id: communication.id },
                data: result.sent
                    ? { status: "sent", providerMessageId: result.providerMessageId || null, attempts, errorMessage: null, nextAttemptAt: null }
                    : {
                          status: exhausted ? "failed" : "failed",
                          attempts,
                          errorMessage: result.error || "Unknown error",
                          nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMinutes * 60_000),
                      },
            })
            .catch((error) => console.error("[warranty-notify] failed to persist retry result", communication.id, error));
    }

    return due.length;
};
