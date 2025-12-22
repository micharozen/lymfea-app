import { useEffect, useState, useRef } from 'react';
import OneSignal from 'react-onesignal';

const PENDING_URL_KEY = 'onesignal_pending_url';

let isOneSignalInitialized = false;
let initializationPromise: Promise<boolean> | null = null;
let notificationClickHandler: ((url: string) => void) | null = null;
let pendingNotificationUrl: string | null = null;

// Store URL in localStorage for persistence across app restarts
const storePendingUrl = (url: string) => {
  console.log('[OneSignal] Storing pending URL in localStorage:', url);
  try {
    localStorage.setItem(PENDING_URL_KEY, url);
  } catch (e) {
    console.error('[OneSignal] Failed to store pending URL:', e);
  }
  pendingNotificationUrl = url;
};

// Get and clear pending URL from localStorage
const getAndClearStoredUrl = (): string | null => {
  try {
    const url = localStorage.getItem(PENDING_URL_KEY);
    if (url) {
      console.log('[OneSignal] Found stored pending URL:', url);
      localStorage.removeItem(PENDING_URL_KEY);
      return url;
    }
  } catch (e) {
    console.error('[OneSignal] Failed to get stored URL:', e);
  }
  return null;
};

// Set the handler for notification clicks (call this from your router component)
export const setNotificationClickHandler = (handler: (url: string) => void) => {
  notificationClickHandler = handler;
  
  // Check both in-memory and localStorage for pending URLs
  const storedUrl = getAndClearStoredUrl();
  const urlToUse = pendingNotificationUrl || storedUrl;
  
  if (urlToUse) {
    console.log('[OneSignal] Processing pending notification URL:', urlToUse);
    handler(urlToUse);
    pendingNotificationUrl = null;
  }
};

// Get pending notification URL (for checking on app mount)
export const getPendingNotificationUrl = (): string | null => {
  // Check both in-memory and localStorage
  const storedUrl = getAndClearStoredUrl();
  const url = pendingNotificationUrl || storedUrl;
  pendingNotificationUrl = null;
  return url;
};

// Pages where OneSignal should NOT initialize (auth pages)
const AUTH_PAGES = ['/auth', '/login', '/set-password', '/update-password', '/pwa/login', '/pwa/welcome', '/pwa/splash'];

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

      // Skip initialization on auth pages - don't prompt for notifications before login
      const currentPath = window.location.pathname;
      if (AUTH_PAGES.some(page => currentPath === page || currentPath.startsWith(page + '/'))) {
        console.log('[OneSignal] Skipping initialization on auth page:', currentPath);
        return;
      }

      // Check if we're on a supported domain for OneSignal
      const allowedDomains = [
        'oom-clone-genesis.lovable.app',
        'localhost',
      ];
      const currentHost = window.location.hostname;
      const isAllowedDomain = allowedDomains.some(domain => currentHost.includes(domain));
      
      if (!isAllowedDomain) {
        console.log('[OneSignal] Skipping initialization - domain not configured:', currentHost);
        console.log('[OneSignal] To enable push notifications on this domain, add it to OneSignal dashboard');
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
            // Use 'focus' instead of 'navigate' - we'll handle navigation ourselves
            notificationClickHandlerMatch: "origin",
            notificationClickHandlerAction: "focus",
            serviceWorkerParam: { scope: "/" },
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
            console.log('[OneSignal] Notification clicked - FULL EVENT:', JSON.stringify(event, null, 2));
            console.log('[OneSignal] event.notification:', JSON.stringify(event?.notification, null, 2));
            console.log('[OneSignal] event.notification.data:', JSON.stringify(event?.notification?.data, null, 2));
            console.log('[OneSignal] event.result:', JSON.stringify(event?.result, null, 2));
            
            // Try multiple possible URL locations
            const url = event?.notification?.launchURL 
              || event?.notification?.data?.launchUrl
              || event?.notification?.data?.url
              || event?.result?.url
              || event?.notification?.url;
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
                // Use storePendingUrl to persist in localStorage
                storePendingUrl(path);
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
