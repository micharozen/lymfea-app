import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import commonFR from './locales/fr/common.json';
import clientFR from './locales/fr/client.json';
import pwaFR from './locales/fr/pwa.json';
import adminFR from './locales/fr/admin.json';

import commonEN from './locales/en/common.json';
import clientEN from './locales/en/client.json';
import pwaEN from './locales/en/pwa.json';
import adminEN from './locales/en/admin.json';

const resources = {
  fr: {
    common: commonFR,
    client: clientFR,
    pwa: pwaFR,
    admin: adminFR,
  },
  en: {
    common: commonEN,
    client: clientEN,
    pwa: pwaEN,
    admin: adminEN,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    defaultNS: 'common',
    ns: ['common', 'client', 'pwa', 'admin'],
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    
    interpolation: {
      escapeValue: false,
    },
    
    react: {
      useSuspense: false,
    },
  });

export default i18n;
