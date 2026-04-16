import { useEffect } from 'react';

export function useAxeptio() {
  useEffect(() => {
    // Avoid loading twice
    if (document.getElementById('axeptio-script')) return;

    window.axeptioSettings = {
      clientId: '69e0a946ea2c52752b067b57',
      cookiesVersion: '39f61d0e-3e1e-4afb-999c-4a5711ca9cd7',
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
  }, []);
}
