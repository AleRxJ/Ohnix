import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import esCommon from '../locales/es/common.json';
import enCommon from '../locales/en/common.json';
import { applyCountryLanguageDefault, shouldRunCountryDetection, isLikelyBot, isBuildTimePrerender, MANUAL_LANGUAGE_KEY } from './geoLanguage.js';

const resources = {
  es: {
    common: esCommon,
  },
  en: {
    common: enCommon,
  },
};

// True only once the user has explicitly picked a language via
// LanguageSwitcher (see useI18n.js). Until then, the language is just an
// automatic guess (browser-language and/or country-based) and is fair game
// to re-evaluate on every load.
const isManuallySelected =
  typeof window !== 'undefined' && window.localStorage.getItem(MANUAL_LANGUAGE_KEY) === '1';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: 'common',
    ns: ['common'],
    // Ohnix's primary market is Spanish-speaking (Colombia). Browser
    // language ("navigator") is deliberately left out of the detection
    // order below - it's unreliable for this audience (many use an
    // English OS/browser but expect Spanish content) and it's what made
    // search engine crawlers, which report en-US, get served English.
    // Spanish is now the true default; only an explicit pick or a
    // successful geo-IP lookup (see below) moves away from it.
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false, // React already protects against XSS
    },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },
  });

// As long as the user hasn't explicitly chosen a language, periodically
// (every 30 days, see AUTO_DETECTION_TTL_MS) refine the Spanish default
// above with the visitor's current country (Spanish-speaking country ->
// es, otherwise -> en). This catches real location changes (moving, long
// trips) without a network call - or a possible language flash - on every
// single page load. A manual pick from LanguageSwitcher always wins and
// stops this check for good.
//
// Skipped entirely for crawlers: Googlebot et al. crawl from US-based
// datacenter IPs, so this lookup would otherwise flip the indexed content
// to English every time regardless of the site's actual audience.
//
// Also skipped for scripts/prerender.js's own build-time pass, for the
// same reason plus one more: that pass bakes its result into the static
// HTML served to real visitors, whose own first render never has a
// resolved geo-IP result yet - running this there guarantees a React
// hydration mismatch (#418/#423) on every prerendered page load.
if (!isManuallySelected && !isLikelyBot() && !isBuildTimePrerender() && shouldRunCountryDetection()) {
  applyCountryLanguageDefault(i18n);
}

export default i18n;
