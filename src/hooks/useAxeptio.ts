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

    const existingScript = document.getElementById('axeptio-script');
    const currentVersion = window.axeptioSettings?.cookiesVersion;

    if (existingScript && currentVersion === cookiesVersion) return;

    if (existingScript) {
      existingScript.remove();
      document
        .querySelectorAll('[id^="axeptio_overlay"], #axeptio_main_button, .axeptio_widget')
        .forEach((el) => el.remove());
      delete (window as unknown as { _axcb?: unknown })._axcb;
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
    script.src = '//static.axept.io/sdk.js';
    document.head.appendChild(script);
  }, [language]);
}
