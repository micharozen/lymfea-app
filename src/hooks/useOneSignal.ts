import { useEffect, useState, useRef } from 'react';
import OneSignal from 'react-onesignal';

let isOneSignalInitialized = false;
let initializationPromise: Promise<boolean> | null = null;
let notificationClickHandler: ((url: string) => void) | null = null;
let pendingNotificationUrl: string | null = null;

// Set the handler for notification clicks (call this from your router component)
export const setNotificationClickHandler = (handler: (url: string) => void) => {
  notificationClickHandler = handler;
  
  // If there's a pending URL from a notification clicked before handler was set, navigate now
  if (pendingNotificationUrl) {
    console.log('[OneSignal] Processing pending notification URL:', pendingNotificationUrl);
    handler(pendingNotificationUrl);
    pendingNotificationUrl = null;
  }
};

// Get pending notification URL (for checking on app mount)
export const getPendingNotificationUrl = (): string | null => {
  const url = pendingNotificationUrl;
  pendingNotificationUrl = null;
  return url;
};

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
        const result = await initializationPromise;
        setIsInitialized(result);
        return;
      }

      // Check if we're in a supported environment
      if (typeof window === 'undefined') {
        console.log('[OneSignal] Not in browser environment');
        return;
      }

      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        console.warn('[OneSignal] Service workers not supported');
        return;
      }

      // Check if notifications are supported
      if (!('Notification' in window)) {
        console.warn('[OneSignal] Notifications not supported');
        return;
      }

      console.log('[OneSignal] Starting initialization...');
      console.log('[OneSignal] User Agent:', navigator.userAgent);
      console.log('[OneSignal] Notification permission:', Notification.permission);

      // Start new initialization
      initializationPromise = (async () => {
        try {
          // Set a timeout for init
          const initPromise = OneSignal.init({
            appId: "a04ba112-a065-4f25-abbf-0abc870092ec",
            allowLocalhostAsSecureOrigin: true,
            notificationClickHandlerMatch: "origin",
            notificationClickHandlerAction: "navigate",
          });

          // Wait for init with timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Init timeout after 15s')), 15000);
          });

          await Promise.race([initPromise, timeoutPromise]);
          
          isOneSignalInitialized = true;
          console.log('[OneSignal] ✅ Initialized successfully');

          // Add listener for notification clicks
          OneSignal.Notifications.addEventListener('click', (event: any) => {
            console.log('[OneSignal] Notification clicked:', JSON.stringify(event, null, 2));
            // Try multiple possible URL locations
            const url = event?.notification?.launchURL 
              || event?.notification?.data?.launchUrl
              || event?.notification?.data?.url
              || event?.result?.url;
            console.log('[OneSignal] Extracted URL:', url);
            
            if (url) {
              // Handle both full URLs and relative paths
              const path = url.startsWith('http') ? new URL(url).pathname : url;
              console.log('[OneSignal] Path to navigate:', path);
              
              if (notificationClickHandler) {
                console.log('[OneSignal] Handler available, navigating immediately');
                notificationClickHandler(path);
              } else {
                console.log('[OneSignal] Handler not set, storing URL for later');
                pendingNotificationUrl = path;
              }
            }
          });
          
          // Log current subscription status
          try {
            const subscribed = OneSignal.User?.PushSubscription?.optedIn;
            const token = OneSignal.User?.PushSubscription?.token;
            console.log('[OneSignal] Subscription status:', { subscribed, hasToken: !!token });
          } catch (e) {
            console.log('[OneSignal] Could not get subscription status');
          }
          
          return true;
        } catch (error) {
          console.error('[OneSignal] ❌ Initialization error:', error);
          initializationPromise = null;
          return false;
        }
      })();

      const result = await initializationPromise;
      setIsInitialized(result);
    };

    initOneSignal();
  }, []);

  return { isInitialized };
};

// Helper to wait for initialization
const waitForInitialization = async (timeout = 5000): Promise<boolean> => {
  if (isOneSignalInitialized) return true;
  
  // If init promise exists, wait for it
  if (initializationPromise) {
    try {
      return await initializationPromise;
    } catch {
      return false;
    }
  }
  
  console.log('[OneSignal] Waiting for initialization...');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (isOneSignalInitialized) {
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
    
    // Check if permission was previously denied
    const currentPermission = Notification.permission;
    console.log('[OneSignal] Current browser permission:', currentPermission);
    
    if (currentPermission === 'denied') {
      console.warn('[OneSignal] Permission previously denied. User must enable in browser settings.');
      return false;
    }
    
    // Use optIn() only - it handles permission request internally
    await OneSignal.User.PushSubscription.optIn();
    
    // Wait a bit for subscription to be processed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const subscribed = OneSignal.User.PushSubscription.optedIn;
    const token = OneSignal.User.PushSubscription.token;
    console.log('[OneSignal] ✅ Subscription result:', { subscribed, hasToken: !!token });
    
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
    return false;
  }
  try {
    return OneSignal.User?.PushSubscription?.optedIn ?? false;
  } catch {
    return false;
  }
};

// Check if initialized (for UI display)
export const isOneSignalReady = (): boolean => {
  return isOneSignalInitialized;
};

// Get diagnostic info
export const getOneSignalDiagnostics = () => {
  return {
    initialized: isOneSignalInitialized,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    notificationsSupported: 'Notification' in window,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unknown',
    userAgent: navigator.userAgent,
  };
};
