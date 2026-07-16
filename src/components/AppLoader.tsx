import { cn } from "@/lib/utils";

interface AppLoaderProps {
  /** Wrap the logo in a full-screen centered container. Default: true. */
  fullScreen?: boolean;
  /** Extra classes applied to the container (e.g. background overrides). */
  className?: string;
}

/**
 * AppLoader - Shared loading indicator for full-page loading states.
 * Displays the Saoma app logo with a subtle pulse animation.
 * Use for Suspense fallbacks and full-page loaders across all UIs.
 */
export function AppLoader({ fullScreen = true, className }: AppLoaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen && "min-h-screen",
        className
      )}
    >
      <img
        src="/images/saoma.png"
        alt="Saoma"
        className="h-20 w-20 rounded-[22%] animate-pulse"
      />
    </div>
  );
}

export default AppLoader;
