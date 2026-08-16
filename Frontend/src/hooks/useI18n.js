import { useTranslation } from 'react-i18next';
import { MANUAL_LANGUAGE_KEY } from '../i18n/geoLanguage.js';

export const useI18n = () => {
  const { t, i18n } = useTranslation();
  const normalizedLanguage = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  return {
    t,
    i18n,
    currentLanguage: normalizedLanguage,
    changeLanguage: (lang) => {
      i18n.__userSelectedLanguage = true;
      // Persisted (not just in-memory) so the automatic country check in
      // i18n/config.js stays off on every future load too, not just this one.
      window.localStorage.setItem(MANUAL_LANGUAGE_KEY, '1');
      return i18n.changeLanguage(lang);
    },
    availableLanguages: ['en', 'es'],
    languageNames: {
      en: 'English',
      es: 'Español',
    },
  };
};

export default useI18n;
