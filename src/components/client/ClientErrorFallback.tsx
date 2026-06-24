import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { reloadWithCacheBust } from '@/lib/reload';

interface ClientErrorFallbackProps {
  error: Error;
  reset: () => void;
}

const CHUNK_ERROR_RELOAD_KEY = "eia_chunk_error_reload";
const RELOAD_MAX_ATTEMPTS = 2;

const isChunkLoadError = (error: Error): boolean => {
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    msg.includes("chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch") ||
    msg.includes("importing a module script failed") ||
    msg.includes("preload")
  );
};

const hardReload = async () => {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // Ignore — we still reload below
  }
  reloadWithCacheBust();
};

const getReloadAttempts = (): number => {
  try {
    const stored = sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
};

const incrementReloadAttempts = (): void => {
  try {
    const current = getReloadAttempts();
    sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, String(current + 1));
  } catch {
    // Ignore sessionStorage errors
  }
};

const clearReloadAttempts = (): void => {
  try {
    sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
  } catch {
    // Ignore sessionStorage errors
  }
};

/**
 * ClientErrorFallback displays a user-friendly error message
 * when something goes wrong in the client booking flow.
 */
export function ClientErrorFallback({ error, reset }: ClientErrorFallbackProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [reloading, setReloading] = useState(false);
  const chunkError = isChunkLoadError(error);

  // Auto-reload on chunk error (once per session to avoid infinite loops)
  useEffect(() => {
    if (chunkError) {
      const attempts = getReloadAttempts();
      
      if (attempts < RELOAD_MAX_ATTEMPTS) {
        incrementReloadAttempts();
        console.info(
          `[ClientErrorFallback] Chunk load error detected (attempt ${attempts + 1}/${RELOAD_MAX_ATTEMPTS}). Auto-reloading...`
        );
        setReloading(true);
        // Small delay to let the error be logged
        setTimeout(() => {
          void hardReload();
        }, 300);
      } else {
        console.warn(
          `[ClientErrorFallback] Max chunk reload attempts (${RELOAD_MAX_ATTEMPTS}) reached. Showing manual reload UI.`
        );
      }
    } else {
      // Not a chunk error — clear any stale reload counter
      clearReloadAttempts();
    }
  }, [chunkError]);

  const onReload = () => {
    clearReloadAttempts();
    setReloading(true);
    void hardReload();
  };

  const attempts = getReloadAttempts();
  const showManualReload = chunkError && attempts >= RELOAD_MAX_ATTEMPTS;

  // Show spinner during auto-reload
  if (reloading && !showManualReload) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
          <p className="text-sm text-gray-500">{t('loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="flex justify-center">
          <div className="bg-red-500/10 rounded-full p-4">
            <AlertTriangle className="h-12 w-12 text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-serif text-gray-900">
            {chunkError
              ? t('errors.updateAvailable', 'A new version is available')
              : t('errors.title', 'Something went wrong')}
          </h1>
          <p className="text-gray-500 text-sm">
            {chunkError
              ? showManualReload
                ? t('errors.reloadFailed', 'Automatic reload failed. Please reload manually.')
                : t('errors.pleaseReload', 'Please reload to continue.')
              : t('errors.description', 'We encountered an unexpected error. Please try again.')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {chunkError ? (
            <Button
              onClick={onReload}
              disabled={reloading}
              className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {reloading ? t('reloading', 'Reloading...') : t('reload', 'Reload')}
            </Button>
          ) : (
            <>
              <Button
                onClick={reset}
                className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('tryAgain', 'Try Again')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(`/client/${slug}`)}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              >
                <Home className="mr-2 h-4 w-4" />
                {t('backToHome', 'Back to Home')}
              </Button>
            </>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="text-left mt-4">
            <summary className="text-gray-400 text-xs cursor-pointer">
              Error details (dev only)
            </summary>
            <pre className="mt-2 text-[10px] text-red-400/70 overflow-auto max-h-32 bg-gray-50 p-2 rounded">
              {error.message}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
