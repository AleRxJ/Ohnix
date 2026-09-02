// ISO 3166-1 alpha-2 codes for Spanish-speaking countries/territories
// (Latin America + Spain + Equatorial Guinea + Puerto Rico).
const SPANISH_SPEAKING_COUNTRY_CODES = new Set([
    "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GQ",
    "GT", "HN", "MX", "NI", "PA", "PY", "PE", "PR", "ES", "UY", "VE",
]);

const GEO_LOOKUP_URL = "https://ipwho.is/";
const GEO_LOOKUP_TIMEOUT_MS = 3000;

// localStorage key marking that the user picked a language explicitly
// (via LanguageSwitcher) rather than it being an automatic guess. Shared
// between config.js (reads it to decide whether to run detection at all)
// and useI18n.js (writes it on manual selection).
export const MANUAL_LANGUAGE_KEY = "language_manual";

// Search engine crawlers (Googlebot in particular) render the page from
// US-based datacenter IPs with a generic en-US environment, so both the
// browser-language guess and this IP geolocation lookup resolve to "en"
// regardless of the site's actual (Colombian/Spanish-speaking) audience.
// Skipping auto-detection for known crawlers keeps the indexed content on
// the site's default language (Spanish) instead of flipping to English.
const BOT_USER_AGENT_PATTERN =
    /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|whatsapp|preview|lighthouse/i;

export function isLikelyBot() {
    if (typeof navigator === "undefined" || !navigator.userAgent) return false;
    return BOT_USER_AGENT_PATTERN.test(navigator.userAgent);
}

// True only during scripts/prerender.js's own build-time render pass (it
// tags every URL it visits with this query param - see main.jsx's
// `isBuildPrerender`). That headless Chromium runs from the build host's
// network (a US-based Vercel container, not a visitor's), so any async
// geo-IP lookup started during that pass would resolve against the wrong
// location entirely - and worse, since prerender.js waits for the network
// to go idle before saving the page's HTML, a lookup that finishes in time
// bakes its result into the static snapshot. hydrateRoot() then compares
// that snapshot against a real visitor's synchronous first render (which
// never sees a resolved geo-IP result yet, matching the LanguageDetector's
// localStorage-only order below and useMarketPricing's null initial state)
// - guaranteed content mismatch, and the exact source of production
// React error #418/#423 on the prerendered marketing pages. Skipping every
// geo-IP-driven effect for this one pass keeps the snapshot pinned to the
// same fallback defaults a fresh real visitor's browser starts with.
export function isBuildTimePrerender() {
    if (typeof window === "undefined" || !window.location) return false;
    return new URLSearchParams(window.location.search).has("ohnix-prerender");
}

// Timestamp (ms) of the last successful automatic country detection. Used
// to re-check periodically instead of either "once ever" (misses real
// location changes) or "every single load" (a network call - and a
// possible language flash - on every visit, forever).
const AUTO_DETECTION_TIMESTAMP_KEY = "language_auto_detected_at";
const AUTO_DETECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function shouldRunCountryDetection() {
    if (typeof window === "undefined") return false;
    const lastRunAt = Number(window.localStorage.getItem(AUTO_DETECTION_TIMESTAMP_KEY));
    if (!lastRunAt) return true;
    return Date.now() - lastRunAt > AUTO_DETECTION_TTL_MS;
}

function languageForCountryCode(countryCode) {
    if (!countryCode) return null;
    return SPANISH_SPEAKING_COUNTRY_CODES.has(countryCode.toUpperCase()) ? "es" : "en";
}

// Exported so other features that need the visitor's country (e.g. the
// public pricing page's currency market) reuse this same geo-IP lookup
// instead of standing up a second ipwho.is integration.
export async function detectCountryCode() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);

    try {
        const response = await fetch(GEO_LOOKUP_URL, { signal: controller.signal });
        if (!response.ok) return null;

        const data = await response.json();
        if (!data || data.success === false || !data.country_code) return null;

        return data.country_code;
    } catch {
        // Network failure, timeout, or blocked request - fall back silently
        // to whatever language the browser-based detector already picked.
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Called by config.js when shouldRunCountryDetection() says the cached
// result (if any) has gone stale. i18next's synchronous navigator-based
// guess already applies immediately so the page never blocks on this; if
// the country-based result disagrees, it corrects the language shortly
// after load and the 30-day timer resets, so this stays a rare background
// check rather than a per-visit one.
export async function applyCountryLanguageDefault(i18nInstance) {
    const countryCode = await detectCountryCode();
    const detectedLanguage = languageForCountryCode(countryCode);
    // Only mark the check as "done" on a successful lookup - a network
    // failure should retry on the next load rather than go quiet for 30 days.
    if (!detectedLanguage) return;
    window.localStorage.setItem(AUTO_DETECTION_TIMESTAMP_KEY, String(Date.now()));

    // Don't clobber a language the user explicitly picked while this lookup
    // was in flight.
    if (i18nInstance.__userSelectedLanguage) return;

    const currentLanguage = (i18nInstance.resolvedLanguage || i18nInstance.language || "").slice(0, 2);
    if (detectedLanguage !== currentLanguage) {
        i18nInstance.changeLanguage(detectedLanguage);
    }
}
