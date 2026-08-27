// Meta (Facebook) Pixel tracking - inert until VITE_META_PIXEL_ID is set.
// The Ads Manager gives you a pixel ID (e.g. "38459121137012165") from
// Events Manager -> set as VITE_META_PIXEL_ID.
// No env var configured means loadMetaPixel()/trackMetaPixelEvent() are
// no-ops, so this can ship and stay dormant until that value exists.
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID?.trim();
const CONTACT_FORM_EVENT = "Lead";

let pixelLoaded = false;

// Defer Facebook Pixel until production and only when actually configured.
// Localhost/dev loads are noisy because browser extensions and ad blockers
// commonly block connect.facebook.net, which is expected and should not crash the app.
export const loadMetaPixel = () => {
    const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");

    if (
        !META_PIXEL_ID ||
        pixelLoaded ||
        import.meta.env.DEV ||
        isLocalhost ||
        typeof document === "undefined"
    ) {
        return;
    }

    pixelLoaded = true;

    window.fbq = window.fbq || function fbq() {
        (window.fbq.queue = window.fbq.queue || []).push(arguments);
    };
    window.fbq.queue = window.fbq.queue || [];
    window.fbq.loaded = true;
    window.fbq.version = "2.0";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onerror = () => {
        window.fbq = function () {
            return undefined;
        };
        window.fbq.queue = [];
        window.fbq.loaded = false;
    };
    document.head.appendChild(script);

    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
};

// Fires a standard Meta Pixel event. Callers get a silent no-op when the
// pixel isn't configured, matching the Google Ads tracking helper.
export const trackMetaPixelEvent = (eventName, params = {}) => {
    if (!META_PIXEL_ID || !eventName || typeof window.fbq !== "function") return;
    window.fbq("track", eventName, params);
};

export const trackContactFormLead = (params) =>
    trackMetaPixelEvent(CONTACT_FORM_EVENT, params);
