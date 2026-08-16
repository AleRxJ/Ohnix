import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import esCommon from '../locales/es/common.json';
import enCommon from '../locales/en/common.json';
import { applyCountryLanguageDefault, shouldRunCountryDetection, MANUAL_LANGUAGE_KEY } from './geoLanguage.js';

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
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already protects against XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },
  });

// As long as the user hasn't explicitly chosen a language, periodically
// (every 30 days, see AUTO_DETECTION_TTL_MS) refine the browser-language
// guess above with the visitor's current country (Spanish-speaking country
// -> es, otherwise -> en). This catches real location changes (moving,
// long trips) without a network call - or a possible language flash - on
// every single page load. A manual pick from LanguageSwitcher always wins
// and stops this check for good.
if (!isManuallySelected && shouldRunCountryDetection()) {
  applyCountryLanguageDefault(i18n);
}

export default i18n;
