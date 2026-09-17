/// <reference types="vite/client" />

interface Window {
  axeptioSettings?: {
    clientId: string;
    cookiesVersion: string;
    googleConsentMode?: {
      default: {
        analytics_storage: string;
        ad_storage: string;
        ad_user_data: string;
        ad_personalization: string;
        wait_for_update: number;
      };
    };
  };
  // File d'attente du SDK Axeptio : remplacée par le SDK une fois chargé,
  // les callbacks poussés sont alors exécutés immédiatement.
  _axcb?: Array<(sdk: { setCookiesVersion?: (version: string) => void }) => void>;
}

// Injectés au build par le bloc `define` de vite.config.ts.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT_SHA__: string;
declare const __APP_BRANCH__: string;
declare const __APP_BUILD_TIME__: string;
