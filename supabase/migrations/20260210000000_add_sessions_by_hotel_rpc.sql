-- Add RPC function to get session counts grouped by hotel for the "Sessions par lieu" chart
CREATE OR REPLACE FUNCTION "public"."get_sessions_by_hotel"(
  "_start_date" "date" DEFAULT (CURRENT_DATE - '30 days'::interval),
  "_end_date" "date" DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  "hotel_id" "text",
  "hotel_name" "text",
  "session_count" bigint
)
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id::TEXT AS hotel_id,
    h.name::TEXT AS hotel_name,
    COUNT(DISTINCT ca.session_id)::BIGINT AS session_count
  FROM public.client_analytics ca
  JOIN public.hotels h ON h.id = ca.hotel_id
  WHERE ca.created_at >= _start_date
    AND ca.created_at < _end_date + INTERVAL '1 day'
  GROUP BY h.id, h.name
  ORDER BY session_count DESC;
END;
$$;

ALTER FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "service_role";
