import { useState, useEffect } from "react";
import { brand, brandLogos } from "@/config/brand";

interface AppErrorFallbackProps {
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
  window.location.reload();
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

export const AppErrorFallback = ({ error, reset }: AppErrorFallbackProps) => {
  const [reloading, setReloading] = useState(false);
  const chunkError = isChunkLoadError(error);

  // Auto-reload on chunk error (once per session to avoid infinite loops)
  useEffect(() => {
    if (chunkError) {
      const attempts = getReloadAttempts();
      
      if (attempts < RELOAD_MAX_ATTEMPTS) {
        incrementReloadAttempts();
        console.info(
          `[AppErrorFallback] Chunk load error detected (attempt ${attempts + 1}/${RELOAD_MAX_ATTEMPTS}). Auto-reloading...`
        );
        setReloading(true);
        // Small delay to let the error be logged
        setTimeout(() => {
          void hardReload();
        }, 300);
      } else {
        console.warn(
          `[AppErrorFallback] Max chunk reload attempts (${RELOAD_MAX_ATTEMPTS}) reached. Showing manual reload UI.`
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-6 animate-pulse" />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground mt-4">Rechargement en cours…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-6" />
      <h1 className="text-xl font-semibold mb-2">
        {chunkError
          ? "Une nouvelle version est disponible"
          : "Une erreur est survenue"}
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {chunkError
          ? showManualReload
            ? "Le rechargement automatique a échoué. Veuillez recharger manuellement."
            : "Veuillez recharger l'application pour continuer."
          : "L'application a rencontré un problème inattendu."}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={onReload}
          disabled={reloading}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {reloading ? "Rechargement…" : "Recharger l'application"}
        </button>
        {!chunkError && (
          <button
            onClick={reset}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Réessayer
          </button>
        )}
      </div>
      {import.meta.env.DEV && (
        <pre className="mt-6 text-xs text-left max-w-md overflow-auto opacity-60">
          {error.message}
        </pre>
      )}
    </div>
  );
};
