import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import brand from '../config/brand.json';

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
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'client', 'pwa', 'admin'],
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    
    interpolation: {
      escapeValue: false,
      defaultVariables: {
        brandName: brand.name,
        brandFullName: brand.fullName,
        brandTagline: brand.tagline,
        companyName: brand.legal.companyName,
        companyType: brand.legal.companyType,
        companyTypeEn: brand.legal.companyTypeEn,
        companyCapital: brand.legal.capital,
        companySiren: brand.legal.siren,
        companySiret: brand.legal.siret,
        companyRcs: brand.legal.rcs,
        companyVat: brand.legal.vatNumber,
        companyAddress: brand.legal.address,
        companyDirector: brand.legal.director,
        contactEmail: brand.legal.contactEmail,
        bookingEmail: brand.legal.bookingEmail,
        contactPhone: brand.legal.phone,
        hostName: brand.legal.host.name,
        hostAddress: brand.legal.host.address,
        website: brand.website,
      },
    },
    
    react: {
      useSuspense: false,
    },
  });

export default i18n;
