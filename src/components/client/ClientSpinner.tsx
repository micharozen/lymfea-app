import { cn } from '@/lib/utils';

interface ClientSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-6 h-6 border-2',
  md: 'w-10 h-10 border-2',
  lg: 'w-16 h-16 border-4',
};

/**
 * ClientSpinner - Standardized loading spinner for the client booking flow.
 * Uses the gold color theme consistent with the client UI.
 */
export function ClientSpinner({ size = 'md', className }: ClientSpinnerProps) {
  return (
    <div
      className={cn(
        "border-gold-400 border-t-transparent rounded-full animate-spin",
        sizeMap[size],
        className
      )}
    />
  );
}

/**
 * ClientPageLoading - Full-page loading state for client pages.
 * Use this as a fallback while lazy-loading client pages.
 */
export function ClientPageLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <ClientSpinner size="lg" />
    </div>
  );
}
