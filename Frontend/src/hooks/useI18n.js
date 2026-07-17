import { useTranslation } from 'react-i18next';

export const useI18n = () => {
  const { t, i18n } = useTranslation();

  return {
    t,
    i18n,
    currentLanguage: i18n.language,
    changeLanguage: (lang) => i18n.changeLanguage(lang),
    availableLanguages: ['en', 'es'],
    languageNames: {
      en: 'English',
      es: 'Español',
    },
  };
};

export default useI18n;
