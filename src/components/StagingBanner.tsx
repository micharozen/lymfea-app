import { AlertTriangle } from "lucide-react";

const STAGING_HOSTNAMES = ["apptest.eiaspa.fr"];

function isStagingEnvironment(): boolean {
  if (import.meta.env.VITE_ENV === "staging") return true;
  if (typeof window === "undefined") return false;
  return STAGING_HOSTNAMES.includes(window.location.hostname);
}

export function StagingBanner() {
  if (!isStagingEnvironment()) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full bg-amber-500 text-amber-950 border-b border-amber-600/40"
    >
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium tracking-wide">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span>Environnement de test</span>
      </div>
    </div>
  );
}
