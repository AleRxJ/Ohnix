import { useTranslation } from 'react-i18next';

export const useI18n = () => {
  const { t, i18n } = useTranslation();
  const normalizedLanguage = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  return {
    t,
    i18n,
    currentLanguage: normalizedLanguage,
    changeLanguage: (lang) => i18n.changeLanguage(lang),
    availableLanguages: ['en', 'es'],
    languageNames: {
      en: 'English',
      es: 'Español',
    },
  };
};

export default useI18n;
