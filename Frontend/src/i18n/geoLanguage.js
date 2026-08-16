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

function languageForCountryCode(countryCode) {
    if (!countryCode) return null;
    return SPANISH_SPEAKING_COUNTRY_CODES.has(countryCode.toUpperCase()) ? "es" : "en";
}

async function detectCountryCode() {
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

// Called on every load for as long as the language is still an automatic
// guess (config.js gates on MANUAL_LANGUAGE_KEY). i18next's synchronous
// navigator-based guess already applies immediately so the page never
// blocks on this; if the country-based result disagrees, it corrects the
// language shortly after load, reflecting the visitor's actual current
// country (including VPN/travel changes) on the next load.
export async function applyCountryLanguageDefault(i18nInstance) {
    const countryCode = await detectCountryCode();
    const detectedLanguage = languageForCountryCode(countryCode);
    if (!detectedLanguage) return;

    // Don't clobber a language the user explicitly picked while this lookup
    // was in flight.
    if (i18nInstance.__userSelectedLanguage) return;

    const currentLanguage = (i18nInstance.resolvedLanguage || i18nInstance.language || "").slice(0, 2);
    if (detectedLanguage !== currentLanguage) {
        i18nInstance.changeLanguage(detectedLanguage);
    }
}
