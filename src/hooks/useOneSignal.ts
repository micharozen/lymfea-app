import { useEffect, useState } from 'react';
import OneSignal from 'react-onesignal';

export const useOneSignal = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initOneSignal = async () => {
      try {
        await OneSignal.init({
          appId: "a04ba112-a065-4f25-abbf-0abc870092ec",
          allowLocalhostAsSecureOrigin: true,
        });
        
        console.log('[OneSignal] Initialized successfully');
        setIsInitialized(true);
      } catch (error) {
        console.error('[OneSignal] Initialization error:', error);
      }
    };

    initOneSignal();
  }, []);

  return { isInitialized };
};

// Helper functions for push notification management
export const oneSignalSubscribe = async (): Promise<boolean> => {
  try {
    await OneSignal.User.PushSubscription.optIn();
    console.log('[OneSignal] Subscribed successfully');
    return true;
  } catch (error) {
    console.error('[OneSignal] Subscribe error:', error);
    return false;
  }
};

export const oneSignalUnsubscribe = async (): Promise<void> => {
  try {
    await OneSignal.User.PushSubscription.optOut();
    console.log('[OneSignal] Unsubscribed successfully');
  } catch (error) {
    console.error('[OneSignal] Unsubscribe error:', error);
  }
};

export const isOneSignalSubscribed = (): boolean => {
  return OneSignal.User.PushSubscription.optedIn ?? false;
};
