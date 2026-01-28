import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'oom-analytics-session';
const TRACKED_PAGES_KEY = 'oom-tracked-pages';

interface AnalyticsMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

type EventType = 'page_view' | 'action' | 'conversion';

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function detectDeviceType(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  const ua = navigator.userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk/.test(ua) ||
      (ua.includes('android') && !ua.includes('mobile'))) {
    return 'tablet';
  }

  if (/iphone|ipod|android.*mobile|windows phone|bb10|blackberry/.test(ua)) {
    return 'mobile';
  }

  if (window.innerWidth > 1024) {
    return 'desktop';
  }

  return 'unknown';
}

function getTrackedPages(): Set<string> {
  try {
    const stored = sessionStorage.getItem(TRACKED_PAGES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markPageAsTracked(pageName: string): void {
  const tracked = getTrackedPages();
  tracked.add(pageName);
  sessionStorage.setItem(TRACKED_PAGES_KEY, JSON.stringify([...tracked]));
}

function hasPageBeenTracked(pageName: string): boolean {
  return getTrackedPages().has(pageName);
}

export function useClientAnalytics(hotelId: string | undefined) {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId();
    }
  }, []);

  const track = useCallback(async (
    eventType: EventType,
    eventName: string,
    metadata?: AnalyticsMetadata
  ) => {
    if (!hotelId) return;

    const sessionId = sessionIdRef.current || getOrCreateSessionId();
    sessionIdRef.current = sessionId;

    try {
      await supabase.from('client_analytics').insert({
        session_id: sessionId,
        hotel_id: hotelId,
        event_type: eventType,
        event_name: eventName,
        page_path: window.location.pathname,
        referrer: document.referrer || null,
        metadata: metadata || {},
        user_agent: navigator.userAgent,
        device_type: detectDeviceType(),
      });
    } catch (error) {
      // Silent fail - analytics should never break the app
      console.warn('Analytics tracking failed:', error);
    }
  }, [hotelId]);

  const trackPageView = useCallback((
    pageName: string,
    metadata?: AnalyticsMetadata
  ) => {
    // Deduplicate page views within the same session
    if (hasPageBeenTracked(pageName)) {
      return;
    }
    markPageAsTracked(pageName);
    track('page_view', pageName, metadata);
  }, [track]);

  const trackAction = useCallback((
    actionName: string,
    metadata?: AnalyticsMetadata
  ) => {
    track('action', actionName, metadata);
  }, [track]);

  const trackConversion = useCallback((
    conversionName: string,
    metadata?: AnalyticsMetadata
  ) => {
    track('conversion', conversionName, metadata);
  }, [track]);

  return {
    trackPageView,
    trackAction,
    trackConversion,
    sessionId: sessionIdRef.current,
  };
}
