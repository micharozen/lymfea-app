import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const CLIENT_ID = '69e0a946ea2c52752b067b57';

const COOKIES_VERSIONS: Record<string, string> = {
  fr: '39f61d0e-3e1e-4afb-999c-4a5711ca9cd7',
  en: '19g6fmou6kbe1',
};

function getVersionForLanguage(language: string): string {
  const lang = language.toLowerCase().split('-')[0];
  return COOKIES_VERSIONS[lang] ?? COOKIES_VERSIONS.fr;
}

export function useAxeptio(): void {
  const { i18n } = useTranslation();
  const language = i18n.language;

  useEffect(() => {
    const cookiesVersion = getVersionForLanguage(language);

    if (window.axeptioSettings?.cookiesVersion === cookiesVersion) return;

    // Le SDK ne peut être initialisé qu'une fois par page : retirer sa balise
    // du DOM ne le décharge pas, et une seconde injection lève
    // « Axeptio SDK is already loaded ». Après le premier chargement, on change
    // donc de version via l'API du SDK plutôt qu'en le réinjectant.
    if (document.getElementById('axeptio-script')) {
      window.axeptioSettings = { ...window.axeptioSettings!, cookiesVersion };
      window._axcb = window._axcb ?? [];
      window._axcb.push((sdk) => sdk.setCookiesVersion?.(cookiesVersion));
      return;
    }

    window.axeptioSettings = {
      clientId: CLIENT_ID,
      cookiesVersion,
      googleConsentMode: {
        default: {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
          wait_for_update: 500,
        },
      },
    };

    const script = document.createElement('script');
    script.id = 'axeptio-script';
    script.async = true;
    // Sans cet attribut, toute exception du SDK remonte en « Script error. »
    // opaque (ni fichier, ni ligne, ni stack) : c'est la règle same-origin.
    // `static.axept.io` renvoie `access-control-allow-origin: *`, le script
    // reste donc exécutable et ses erreurs deviennent lisibles.
    script.crossOrigin = 'anonymous';
    script.src = '//static.axept.io/sdk.js';
    document.head.appendChild(script);
  }, [language]);
}
