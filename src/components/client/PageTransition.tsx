import { useLocation } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * PageTransition provides a smooth fade transition between pages.
 * Uses CSS transitions for performance (no external animation library needed).
 * The bg-black ensures no white flash during the opacity transition.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    // Only animate if the path actually changed
    if (location.pathname !== prevPathRef.current) {
      // Fade out
      setIsVisible(false);

      const timeout = setTimeout(() => {
        setDisplayChildren(children);
        prevPathRef.current = location.pathname;
        // Fade in
        setIsVisible(true);
      }, 100); // Quick transition to feel snappy

      return () => clearTimeout(timeout);
    } else {
      // Same path, just update children without animation
      setDisplayChildren(children);
    }
  }, [location.pathname, children]);

  return (
    <div className="min-h-screen bg-black">
      <div
        className={cn(
          "transition-opacity duration-100 ease-out",
          isVisible ? "opacity-100" : "opacity-0"
        )}
      >
        {displayChildren}
      </div>
    </div>
  );
}
