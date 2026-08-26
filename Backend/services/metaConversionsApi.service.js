// Backend/services/metaConversionsApi.service.js
//
// Meta Conversions API (server-side) - inert until META_PIXEL_ID and
// META_CAPI_ACCESS_TOKEN are both set. Complements the browser Meta Pixel
// (Frontend/src/utils/metaPixel.js): that one fires from the visitor's
// browser and gets silently dropped by ad blockers, Brave Shields, Safari
// ITP, etc. This one fires straight from our own backend after a form is
// actually saved, so leads are counted regardless of the visitor's browser.
//
// Get the access token from Events Manager -> Ohnix Web Pixel ->
// Settings -> Conversions API -> Generate access token.

import crypto from "crypto";

const META_PIXEL_ID = process.env.META_PIXEL_ID?.trim();
const META_CAPI_ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN?.trim();
const GRAPH_API_VERSION = "v21.0";

const sha256 = (value) =>
    crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

// Sends one event to Meta. Never throws - a Meta outage or bad token should
// not affect the caller's own request/response flow.
export const sendMetaConversionEvent = async ({
    eventName,
    email,
    phone,
    clientIp,
    userAgent,
    eventSourceUrl,
    testEventCode,
}) => {
    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) return;

    const userData = {};
    if (email) userData.em = [sha256(email)];
    if (phone) userData.ph = [sha256(phone.replace(/\D/g, ""))];
    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;

    const body = {
        data: [
            {
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                event_source_url: eventSourceUrl,
                user_data: userData,
            },
        ],
    };
    if (testEventCode) body.test_event_code = testEventCode;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            console.error("Meta Conversions API error:", response.status, await response.text());
        }
    } catch (error) {
        console.error("Meta Conversions API request failed:", error.message);
    }
};

export const sendContactFormLeadEvent = (params) =>
    sendMetaConversionEvent({ eventName: "Lead", ...params });
