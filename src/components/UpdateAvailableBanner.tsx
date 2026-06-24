import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { reloadWithCacheBust } from '@/lib/reload';

/**
 * Displays a non-intrusive banner at the top of the screen when a new version
 * of the app is available, prompting the user to reload.
 * 
 * This is a proactive approach to prevent chunk load errors by encouraging
 * users to refresh before they encounter missing chunks.
 */
export function UpdateAvailableBanner() {
  const { updateAvailable } = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Reset dismissed state when update becomes available
  useEffect(() => {
    if (updateAvailable) {
      setDismissed(false);
    }
  }, [updateAvailable]);

  const handleReload = () => {
    setIsReloading(true);
    // Clear all relevant storage to ensure clean reload
    try {
      sessionStorage.removeItem('app_etag');
      sessionStorage.removeItem('__chunk_reloaded_at');
      sessionStorage.removeItem('__chunk_reload_attempts');
      sessionStorage.removeItem('eia_chunk_error_reload');
    } catch {
      // Ignore storage errors
    }
    reloadWithCacheBust();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] animate-in slide-in-from-top">
      <div className="bg-primary text-primary-foreground px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <RefreshCw className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                Une nouvelle version est disponible
              </p>
              <p className="text-xs opacity-90 hidden sm:block">
                Rechargez la page pour profiter des dernières améliorations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleReload}
              disabled={isReloading}
              className="bg-white text-primary px-4 py-1.5 rounded-md text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReloading ? 'Rechargement...' : 'Recharger'}
            </button>
            <button
              onClick={handleDismiss}
              disabled={isReloading}
              className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
