import React, { createContext, useContext, useMemo } from 'react';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';

interface AnalyticsContextType {
  trackPageView: (pageName: string, metadata?: Record<string, unknown>) => void;
  trackAction: (actionName: string, metadata?: Record<string, unknown>) => void;
  trackConversion: (conversionName: string, metadata?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

interface AnalyticsProviderProps {
  children: React.ReactNode;
  hotelId: string | undefined;
}

export function AnalyticsProvider({ children, hotelId }: AnalyticsProviderProps) {
  const analytics = useClientAnalytics(hotelId);

  const value = useMemo(() => ({
    trackPageView: analytics.trackPageView,
    trackAction: analytics.trackAction,
    trackConversion: analytics.trackConversion,
  }), [analytics.trackPageView, analytics.trackAction, analytics.trackConversion]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextType {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}
