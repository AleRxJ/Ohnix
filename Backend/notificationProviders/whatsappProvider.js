// WhatsApp Business Cloud API (Meta Graph API) adapter - the WhatsApp half
// of the NotificationProvider abstraction the warranties spec asks for (see
// emailProvider.js for the other half). Real client, but deliberately inert
// until the merchant supplies their own Meta Business credentials: nothing
// in Ohnix's own code can complete the WhatsApp Business verification or
// Message Template approval a merchant's account needs, that's an
// external, per-account setup step in Meta Business Manager.
//
// Meta's actual constraint this adapter is built around (not a
// self-imposed limitation): a message a BUSINESS initiates - like a
// warranty status update the customer didn't just ask about - can only be
// delivered outside an open 24h customer-service window through a
// pre-approved Message Template (an "HSM"), addressed by template name +
// language + positional parameters ({{1}}, {{2}}, ...). Free-form text
// (what emailProvider.js sends) is rejected by the API for this kind of
// proactive notification. That's why `send` below takes a `templateName` +
// positional `params` instead of a rendered `html`/`text` body, and why
// WarrantyNotificationTemplate.bodyTemplate (free {{var}} text) is only
// ever used to preview/compose what a merchant would need to get approved
// as an actual Meta template - Ohnix cannot send that text verbatim.
const GRAPH_API_VERSION = "v20.0";
const REQUEST_TIMEOUT_MS = 15000;

export const channel = "whatsapp";

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me";
};

export const isConfigured = () =>
    !isPlaceholder(process.env.WHATSAPP_ACCESS_TOKEN) && !isPlaceholder(process.env.WHATSAPP_PHONE_NUMBER_ID);

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

// `to` must be E.164 (e.g. "573001234567", no "+"/spaces) - callers are
// responsible for normalizing Customer.whatsapp/phone before calling this.
// `templateName`/`templateLanguage` must already exist, approved, in the
// merchant's own WhatsApp Business Account; `params` fills the template's
// {{1}}, {{2}}, ... body placeholders in order.
export const send = async ({ to, templateName, templateLanguage = "es", params = [] }) => {
    if (!isConfigured()) {
        return { sent: false, error: "WhatsApp provider not configured" };
    }
    if (!templateName) {
        return { sent: false, error: "No approved WhatsApp template configured for this event" };
    }

    try {
        const response = await withTimeout(
            (signal) =>
                fetch(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            messaging_product: "whatsapp",
                            to,
                            type: "template",
                            template: {
                                name: templateName,
                                language: { code: templateLanguage },
                                components: params.length
                                    ? [
                                          {
                                              type: "body",
                                              parameters: params.map((text) => ({ type: "text", text: String(text) })),
                                          },
                                      ]
                                    : undefined,
                            },
                        }),
                        signal,
                    }
                ),
            REQUEST_TIMEOUT_MS
        );

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            return { sent: false, error: payload?.error?.message || `WhatsApp request failed with HTTP ${response.status}` };
        }
        return { sent: true, providerMessageId: payload?.messages?.[0]?.id || null };
    } catch (error) {
        return { sent: false, error: error.name === "AbortError" ? "Request timed out" : error.message };
    }
};
