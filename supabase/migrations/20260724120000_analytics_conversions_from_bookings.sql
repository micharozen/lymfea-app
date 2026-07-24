-- Analytics "Conversions" / "Taux de conversion" comptaient les évènements
-- client_analytics.event_type = 'conversion', mais aucun code n'émet jamais cet
-- évènement (trackConversion n'est appelé nulle part). Résultat : la carte
-- Conversions restait à 0 et le taux à 0 %, quel que soit le nombre de vraies
-- réservations prises en ligne.
--
-- On rebranche donc le compteur sur la table bookings : une conversion = une
-- réservation réellement prise via un canal en ligne. source='client' correspond
-- au flux client public (affiché "Site"), source='api' aux partenaires. Les
-- paniers abandonnés (drafts non finalisés) gardent source='admin' par défaut et
-- sont donc naturellement exclus. Le taux = conversions / sessions distinctes.
CREATE OR REPLACE FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text" DEFAULT NULL::"text", "_start_date" "date" DEFAULT (CURRENT_DATE - '30 days'::interval), "_end_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("total_sessions" bigint, "total_page_views" bigint, "total_conversions" bigint, "conversion_rate" numeric, "device_breakdown" "jsonb", "daily_visitors" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _device_breakdown JSONB;
  _daily_visitors JSONB;
  _sessions BIGINT;
  _page_views BIGINT;
  _conversions BIGINT;
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

  -- Sessions + pages vues : issues du tracking client_analytics.
  SELECT
    COUNT(DISTINCT session_id)::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'page_view')::BIGINT
  INTO _sessions, _page_views
  FROM public.client_analytics
  WHERE created_at >= _start_date
    AND created_at < _end_date + INTERVAL '1 day'
    AND (_hotel_id IS NULL OR hotel_id = _hotel_id);

  -- Conversions : vraies réservations prises en ligne (source 'client' = "Site",
  -- 'api' = partenaire), comptées par date de création. Découplé des évènements
  -- client_analytics qui ne sont jamais émis pour une conversion.
  SELECT COUNT(*)::BIGINT
  INTO _conversions
  FROM public.bookings
  WHERE created_at >= _start_date
    AND created_at < _end_date + INTERVAL '1 day'
    AND source IN ('client', 'api')
    AND (_hotel_id IS NULL OR hotel_id = _hotel_id);

  RETURN QUERY
  SELECT
    _sessions,
    _page_views,
    _conversions,
    CASE
      WHEN _sessions > 0
      THEN ROUND((_conversions::NUMERIC / _sessions::NUMERIC) * 100, 2)
      ELSE 0
    END,
    _device_breakdown,
    _daily_visitors;
END;
$$;
