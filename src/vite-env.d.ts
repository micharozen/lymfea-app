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
}
