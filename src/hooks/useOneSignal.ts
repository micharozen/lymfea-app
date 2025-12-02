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
        console.log('[OneSignal] Already initialized');
        setIsInitialized(true);
        return;
      }

      // If initialization is in progress, wait for it
      if (initializationPromise) {
        console.log('[OneSignal] Waiting for existing initialization...');
        await initializationPromise;
        setIsInitialized(true);
        return;
      }

      // Start new initialization
      console.log('[OneSignal] Starting initialization...');
      initializationPromise = (async () => {
        try {
          await OneSignal.init({
            appId: "a04ba112-a065-4f25-abbf-0abc870092ec",
            allowLocalhostAsSecureOrigin: true,
          });
          
          isOneSignalInitialized = true;
          console.log('[OneSignal] ✅ Initialized successfully');
          
          // Log current subscription status
          try {
            const subscribed = OneSignal.User.PushSubscription.optedIn;
            const token = OneSignal.User.PushSubscription.token;
            console.log('[OneSignal] Current subscription status:', { subscribed, hasToken: !!token });
          } catch (e) {
            console.log('[OneSignal] Could not get subscription status:', e);
          }
        } catch (error) {
          console.error('[OneSignal] ❌ Initialization error:', error);
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
const waitForInitialization = async (timeout = 10000): Promise<boolean> => {
  if (isOneSignalInitialized) return true;
  
  console.log('[OneSignal] Waiting for initialization...');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (isOneSignalInitialized) {
      console.log('[OneSignal] Initialization completed');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.warn('[OneSignal] Initialization timeout');
  return false;
};

// Set the external user ID (Supabase user_id) for targeting
export const setOneSignalExternalUserId = async (userId: string): Promise<void> => {
  try {
    const initialized = await waitForInitialization();
    if (!initialized) {
      console.warn('[OneSignal] Not initialized, skipping login');
      return;
    }

    console.log('[OneSignal] Setting external user ID:', userId);
    await OneSignal.login(userId);
    console.log('[OneSignal] ✅ External user ID set successfully');
  } catch (error) {
    console.error('[OneSignal] ❌ Error setting external user ID:', error);
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

    console.log('[OneSignal] Requesting push subscription...');
    
    // Request permission first (this triggers the native prompt)
    const permission = await OneSignal.Notifications.requestPermission();
    console.log('[OneSignal] Permission result:', permission);
    
    if (!permission) {
      console.warn('[OneSignal] Permission denied');
      return false;
    }

    // Then opt in
    await OneSignal.User.PushSubscription.optIn();
    
    // Wait a bit for subscription to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const subscribed = OneSignal.User.PushSubscription.optedIn;
    const token = OneSignal.User.PushSubscription.token;
    console.log('[OneSignal] ✅ Subscription result:', { subscribed, hasToken: !!token, token: token?.substring(0, 20) + '...' });
    
    return subscribed ?? false;
  } catch (error) {
    console.error('[OneSignal] ❌ Subscribe error:', error);
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
  if (!isOneSignalInitialized) {
    console.log('[OneSignal] Not initialized yet, returning false for subscription check');
    return false;
  }
  try {
    const subscribed = OneSignal.User.PushSubscription.optedIn ?? false;
    console.log('[OneSignal] Subscription check:', subscribed);
    return subscribed;
  } catch (e) {
    console.error('[OneSignal] Error checking subscription:', e);
    return false;
  }
};

// Check if initialized (for UI display)
export const isOneSignalReady = (): boolean => {
  return isOneSignalInitialized;
};
