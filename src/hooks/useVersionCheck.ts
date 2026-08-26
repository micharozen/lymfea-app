import { useEffect, useState } from 'react';
import { APP_COMMIT_SHA } from '@/lib/appVersion';

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_META_NAME = 'app-version';
const VERSION_META_RE = new RegExp(
  `<meta\\s+name=["']${VERSION_META_NAME}["']\\s+content=["']([^"']+)["']`,
  'i',
);

/**
 * Checks if a new version of the app is available by comparing the build SHA
 * compiled into this bundle with the one served in index.html.
 *
 * The previous implementation diffed the `ETag` header, but scripts/serve-prod.mjs
 * never sets one (Node's http server doesn't add it either), so the header was
 * always null and the check silently never fired.
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
          cache: 'no-cache',
        });

        if (response.ok) {
          const servedSha = VERSION_META_RE.exec(await response.text())?.[1];

          if (servedSha && servedSha !== APP_COMMIT_SHA) {
            console.info('[VersionCheck] New version detected', {
              running: APP_COMMIT_SHA,
              served: servedSha,
            });
            if (isMounted) {
              setUpdateAvailable(true);
            }
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
