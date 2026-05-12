import { useState } from "react";
import { brand, brandLogos } from "@/config/brand";

interface AppErrorFallbackProps {
  error: Error;
  reset: () => void;
}

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

export const AppErrorFallback = ({ error, reset }: AppErrorFallbackProps) => {
  const [reloading, setReloading] = useState(false);
  const chunkError = isChunkLoadError(error);

  const onReload = () => {
    setReloading(true);
    void hardReload();
  };

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
          ? "Veuillez recharger l'application pour continuer."
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
