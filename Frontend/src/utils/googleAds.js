// Google Ads conversion tracking - inert until VITE_GOOGLE_ADS_ID is set.
// Once a campaign is created, Google Ads gives you:
//   1) A conversion ID, e.g. "AW-123456789" -> set as VITE_GOOGLE_ADS_ID
//   2) A conversion label per action, e.g. "AbC-D_efGhIjKlmn" -> set as
//      VITE_GOOGLE_ADS_CONTACT_LABEL (add more *_LABEL vars per action)
// No env var configured means loadGoogleAdsTag()/trackGoogleAdsConversion()
// are no-ops, so this can ship and stay dormant until those values exist.
const GOOGLE_ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID?.trim();
const CONTACT_FORM_CONVERSION_LABEL = import.meta.env.VITE_GOOGLE_ADS_CONTACT_LABEL?.trim();

let tagLoaded = false;

// Injects the global site tag (gtag.js) once. Safe to call multiple times.
export const loadGoogleAdsTag = () => {
    if (!GOOGLE_ADS_ID || tagLoaded || typeof document === "undefined") return;
    tagLoaded = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line no-inner-declarations
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ADS_ID);
};

// Fires a conversion event. `conversionLabel` is one of the *_LABEL env vars
// above; callers that don't pass a configured label are silently skipped.
export const trackGoogleAdsConversion = (conversionLabel, params = {}) => {
    if (!GOOGLE_ADS_ID || !conversionLabel || typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${conversionLabel}`,
        ...params,
    });
};

export const trackContactFormConversion = (params) =>
    trackGoogleAdsConversion(CONTACT_FORM_CONVERSION_LABEL, params);
