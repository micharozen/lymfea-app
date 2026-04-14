import { useLocation } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

const SKIP_TRANSITION_ROUTES = ['/schedule', '/treatments'];

const shouldSkipTransition = (pathname: string) =>
  SKIP_TRANSITION_ROUTES.some((suffix) => pathname.endsWith(suffix));

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      if (shouldSkipTransition(location.pathname)) {
        setVisible(true);
        return;
      }
      setVisible(false);
      requestAnimationFrame(() => setVisible(true));
    }
  }, [location.pathname]);

  const animate = visible && !shouldSkipTransition(location.pathname);

  return (
    <div className={`min-h-screen ${animate ? 'animate-page-fade-in' : visible ? '' : 'opacity-0'}`}>
      {children}
    </div>
  );
}
