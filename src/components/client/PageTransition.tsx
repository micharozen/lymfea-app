import { useLocation } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      setVisible(false);
      // Force reflow then re-enable animation
      requestAnimationFrame(() => setVisible(true));
    }
  }, [location.pathname]);

  return (
    <div className={`min-h-screen ${visible ? 'animate-page-fade-in' : 'opacity-0'}`}>
      {children}
    </div>
  );
}
