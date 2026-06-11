import { useEffect, useState } from 'react';

// Build timestamp injected at build time via Vite
const CURRENT_BUILD_TIME = import.meta.env.VITE_BUILD_TIME || Date.now();
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_META_NAME = 'app-version';

/**
 * Checks if a new version of the app is available by comparing build timestamps.
 * Returns true if a newer version is detected on the server.
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkVersion = async () => {
      // Skip in development
      if (import.meta.env.DEV) return;
      
      // Skip if already detected update
      if (updateAvailable) return;
      
      // Skip if already checking
      if (checking) return;

      try {
        setChecking(true);
        
        // Fetch index.html with cache-busting
        const response = await fetch(`/index.html?_t=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-cache',
        });

        if (response.ok) {
          // Check if ETag has changed (indicates new deployment)
          const etag = response.headers.get('ETag');
          const lastEtag = sessionStorage.getItem('app_etag');
          
          if (lastEtag && etag && lastEtag !== etag) {
            console.info('[VersionCheck] New version detected via ETag change');
            if (isMounted) {
              setUpdateAvailable(true);
            }
          } else if (etag) {
            // Store initial ETag
            sessionStorage.setItem('app_etag', etag);
          }
        }
      } catch (error) {
        console.warn('[VersionCheck] Failed to check version:', error);
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    // Initial check after 30s (give time for app to load)
    const initialTimeout = setTimeout(() => {
      void checkVersion();
    }, 30_000);

    // Periodic checks
    intervalId = setInterval(() => {
      void checkVersion();
    }, VERSION_CHECK_INTERVAL);

    // Check on window focus (user comes back to tab)
    const handleFocus = () => {
      void checkVersion();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [updateAvailable, checking]);

  return { updateAvailable };
}
