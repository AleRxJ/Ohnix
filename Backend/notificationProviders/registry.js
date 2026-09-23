import * as emailProvider from "./emailProvider.js";
import * as whatsappProvider from "./whatsappProvider.js";

// The NotificationProvider registry - warrantyNotification.service.js (and
// any future feature that needs to notify a customer) looks a channel up
// here instead of importing a specific provider directly, so swapping the
// WhatsApp vendor later (e.g. a BSP instead of Meta directly) means adding a
// new provider module and changing this one line, not touching any caller.
export const providers = {
    email: emailProvider,
    whatsapp: whatsappProvider,
};

export const getProvider = (channel) => providers[channel] || null;
