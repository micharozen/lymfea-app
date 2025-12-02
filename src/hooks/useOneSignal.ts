import { useEffect, useState, useRef } from 'react';
import OneSignal from 'react-onesignal';

let isOneSignalInitialized = false;
let initializationPromise: Promise<void> | null = null;

export const useOneSignal = () => {
  const [isInitialized, setIsInitialized] = useState(isOneSignalInitialized);
  const initAttempted = useRef(false);

  useEffect(() => {
    // Prevent multiple initialization attempts
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initOneSignal = async () => {
      // If already initialized, just update state
      if (isOneSignalInitialized) {
        setIsInitialized(true);
        return;
      }

      // If initialization is in progress, wait for it
      if (initializationPromise) {
        await initializationPromise;
        setIsInitialized(true);
        return;
      }

      // Start new initialization
      initializationPromise = (async () => {
        try {
          await OneSignal.init({
            appId: "a04ba112-a065-4f25-abbf-0abc870092ec",
            allowLocalhostAsSecureOrigin: true,
          });
          
          isOneSignalInitialized = true;
          console.log('[OneSignal] Initialized successfully');
        } catch (error) {
          console.error('[OneSignal] Initialization error:', error);
          initializationPromise = null;
        }
      })();

      await initializationPromise;
      setIsInitialized(isOneSignalInitialized);
    };

    initOneSignal();
  }, []);

  return { isInitialized };
};

// Helper to wait for initialization
const waitForInitialization = async (timeout = 5000): Promise<boolean> => {
  if (isOneSignalInitialized) return true;
  
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (isOneSignalInitialized) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
};

// Set the external user ID (Supabase user_id) for targeting
export const setOneSignalExternalUserId = async (userId: string): Promise<void> => {
  try {
    // Wait for initialization before calling login
    const initialized = await waitForInitialization();
    if (!initialized) {
      console.warn('[OneSignal] Not initialized, skipping login');
      return;
    }

    await OneSignal.login(userId);
    console.log('[OneSignal] External user ID set:', userId);
  } catch (error) {
    console.error('[OneSignal] Error setting external user ID:', error);
  }
};

// Clear the external user ID on logout
export const clearOneSignalExternalUserId = async (): Promise<void> => {
  try {
    const initialized = await waitForInitialization();
    if (!initialized) {
      console.warn('[OneSignal] Not initialized, skipping logout');
      return;
    }

    await OneSignal.logout();
    console.log('[OneSignal] External user ID cleared');
  } catch (error) {
    console.error('[OneSignal] Error clearing external user ID:', error);
  }
};

// Helper functions for push notification management
export const oneSignalSubscribe = async (): Promise<boolean> => {
  try {
    const initialized = await waitForInitialization();
    if (!initialized) {
      console.warn('[OneSignal] Not initialized, cannot subscribe');
      return false;
    }

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
    const initialized = await waitForInitialization();
    if (!initialized) {
      console.warn('[OneSignal] Not initialized, cannot unsubscribe');
      return;
    }

    await OneSignal.User.PushSubscription.optOut();
    console.log('[OneSignal] Unsubscribed successfully');
  } catch (error) {
    console.error('[OneSignal] Unsubscribe error:', error);
  }
};

export const isOneSignalSubscribed = (): boolean => {
  if (!isOneSignalInitialized) return false;
  try {
    return OneSignal.User.PushSubscription.optedIn ?? false;
  } catch {
    return false;
  }
};
