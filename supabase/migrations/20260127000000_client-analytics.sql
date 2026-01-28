-- Migration: Client Analytics System
-- Purpose: Track client journey through the booking funnel

-- 1. Create client_analytics table
CREATE TABLE IF NOT EXISTS public.client_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  hotel_id TEXT NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'action', 'conversion')),
  event_name TEXT NOT NULL,
  page_path TEXT,
  referrer TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  user_agent TEXT,
  device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX idx_client_analytics_hotel_id ON public.client_analytics(hotel_id);
CREATE INDEX idx_client_analytics_session_id ON public.client_analytics(session_id);
CREATE INDEX idx_client_analytics_event_type ON public.client_analytics(event_type);
CREATE INDEX idx_client_analytics_created_at ON public.client_analytics(created_at);
CREATE INDEX idx_client_analytics_hotel_created ON public.client_analytics(hotel_id, created_at);
CREATE INDEX idx_client_analytics_event_name ON public.client_analytics(event_name);

-- 3. Enable RLS
ALTER TABLE public.client_analytics ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Allow anonymous inserts (for client tracking - guests are not authenticated)
CREATE POLICY "Allow anonymous inserts" ON public.client_analytics
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admin/concierge can read analytics
CREATE POLICY "Admin and concierge can read analytics" ON public.client_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'concierge')
    )
  );

-- 5. Function: get_client_funnel
-- Returns funnel data with step progression
CREATE OR REPLACE FUNCTION public.get_client_funnel(
  _hotel_id TEXT DEFAULT NULL,
  _start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  step_name TEXT,
  step_order INTEGER,
  unique_sessions BIGINT,
  total_events BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH funnel_steps AS (
    SELECT
      ca.event_name,
      ca.session_id,
      CASE ca.event_name
        WHEN 'welcome' THEN 1
        WHEN 'treatments' THEN 2
        WHEN 'schedule' THEN 3
        WHEN 'guest_info' THEN 4
        WHEN 'payment' THEN 5
        WHEN 'booking_completed' THEN 6
        ELSE 99
      END as step_ord
    FROM public.client_analytics ca
    WHERE ca.event_type IN ('page_view', 'conversion')
      AND ca.created_at >= _start_date
      AND ca.created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR ca.hotel_id = _hotel_id)
      AND ca.event_name IN ('welcome', 'treatments', 'schedule', 'guest_info', 'payment', 'booking_completed')
  )
  SELECT
    fs.event_name::TEXT as step_name,
    MIN(fs.step_ord)::INTEGER as step_order,
    COUNT(DISTINCT fs.session_id)::BIGINT as unique_sessions,
    COUNT(*)::BIGINT as total_events
  FROM funnel_steps fs
  GROUP BY fs.event_name
  ORDER BY MIN(fs.step_ord);
END;
$$;

-- 6. Function: get_hotel_analytics_summary
-- Returns summary statistics for analytics dashboard
CREATE OR REPLACE FUNCTION public.get_hotel_analytics_summary(
  _hotel_id TEXT DEFAULT NULL,
  _start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  total_sessions BIGINT,
  total_page_views BIGINT,
  total_conversions BIGINT,
  conversion_rate NUMERIC,
  device_breakdown JSONB,
  daily_visitors JSONB
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _device_breakdown JSONB;
  _daily_visitors JSONB;
BEGIN
  -- Device breakdown
  SELECT COALESCE(jsonb_object_agg(dt, cnt), '{}'::JSONB)
  INTO _device_breakdown
  FROM (
    SELECT
      COALESCE(device_type, 'unknown') as dt,
      COUNT(DISTINCT session_id)::BIGINT as cnt
    FROM public.client_analytics
    WHERE created_at >= _start_date
      AND created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR hotel_id = _hotel_id)
    GROUP BY device_type
  ) sub;

  -- Daily visitors
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::TEXT, 'visitors', visitors) ORDER BY day), '[]'::JSONB)
  INTO _daily_visitors
  FROM (
    SELECT
      DATE(created_at) as day,
      COUNT(DISTINCT session_id)::BIGINT as visitors
    FROM public.client_analytics
    WHERE created_at >= _start_date
      AND created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR hotel_id = _hotel_id)
    GROUP BY DATE(created_at)
  ) sub;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT session_id)::BIGINT as total_sessions,
    COUNT(*) FILTER (WHERE event_type = 'page_view')::BIGINT as total_page_views,
    COUNT(*) FILTER (WHERE event_type = 'conversion')::BIGINT as total_conversions,
    CASE
      WHEN COUNT(DISTINCT session_id) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'conversion')::NUMERIC / COUNT(DISTINCT session_id)::NUMERIC) * 100, 2)
      ELSE 0
    END as conversion_rate,
    _device_breakdown as device_breakdown,
    _daily_visitors as daily_visitors
  FROM public.client_analytics
  WHERE created_at >= _start_date
    AND created_at < _end_date + INTERVAL '1 day'
    AND (_hotel_id IS NULL OR hotel_id = _hotel_id);
END;
$$;

-- 7. Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_client_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hotel_analytics_summary TO authenticated;
