-- Add configurable slot interval per venue
-- Allows each venue to choose its booking time slot granularity (15, 20, 30, 45, or 60 minutes)
-- Default 30 minutes preserves existing behavior

ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS slot_interval INTEGER DEFAULT 30;

-- Update get_public_hotel_by_id to include slot_interval
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "name" text,
  "image" text,
  "cover_image" text,
  "city" text,
  "country" text,
  "currency" text,
  "status" text,
  "vat" numeric,
  "opening_time" time without time zone,
  "closing_time" time without time zone,
  "schedule_type" text,
  "days_of_week" integer[],
  "recurrence_interval" integer,
  "recurring_start_date" date,
  "recurring_end_date" date,
  "venue_type" text,
  "description" text,
  "landing_subtitle" text,
  "offert" boolean,
  "slot_interval" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status,
    h.vat,
    h.opening_time,
    h.closing_time,
    vds.schedule_type::text,
    vds.days_of_week,
    COALESCE(vds.recurrence_interval, 1),
    vds.recurring_start_date,
    vds.recurring_end_date,
    h.venue_type,
    h.description,
    h.landing_subtitle,
    COALESCE(h.offert, false),
    COALESCE(h.slot_interval, 30)
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO service_role;

-- Update get_enterprise_session_data to include slot_interval and use dynamic interval
CREATE OR REPLACE FUNCTION get_enterprise_session_data(
  _hotel_id TEXT,
  _session_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _hotel RECORD;
  _day_of_week INTEGER;
  _total_slots INTEGER;
  _blocked_slot_units INTEGER;
  _slot_seconds INTEGER;
  _result JSON;
BEGIN
  -- 1. Get hotel info
  SELECT id, name, image, cover_image, venue_type,
         opening_time, closing_time, timezone, currency,
         COALESCE(slot_interval, 30) AS slot_interval
  INTO _hotel
  FROM hotels
  WHERE id = _hotel_id;

  IF _hotel IS NULL THEN
    RETURN json_build_object('error', 'hotel_not_found');
  END IF;

  -- 2. Day of week (0=Sunday, 6=Saturday) — matches JS getDay() and PostgreSQL DOW
  _day_of_week := EXTRACT(DOW FROM _session_date)::INTEGER;

  -- 3. Calculate total slot windows between opening and closing using configured interval
  _slot_seconds := _hotel.slot_interval * 60;
  _total_slots := EXTRACT(EPOCH FROM (
    COALESCE(_hotel.closing_time, '23:00:00')::TIME -
    COALESCE(_hotel.opening_time, '06:00:00')::TIME
  ))::INTEGER / _slot_seconds;

  -- 4. Subtract blocked slot units (e.g., lunch breaks)
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / _slot_seconds
  ), 0)
  INTO _blocked_slot_units
  FROM venue_blocked_slots
  WHERE hotel_id = _hotel_id
    AND is_active = true
    AND (days_of_week IS NULL OR _day_of_week = ANY(days_of_week));

  _total_slots := GREATEST(_total_slots - _blocked_slot_units, 0);

  -- 5. Build result JSON
  SELECT json_build_object(
    'hotel', json_build_object(
      'id', _hotel.id,
      'name', _hotel.name,
      'image', _hotel.image,
      'cover_image', _hotel.cover_image,
      'venue_type', _hotel.venue_type,
      'opening_time', _hotel.opening_time,
      'closing_time', _hotel.closing_time,
      'timezone', _hotel.timezone,
      'currency', _hotel.currency,
      'slot_interval', _hotel.slot_interval
    ),
    'is_deployed', is_venue_available_on_date(_hotel_id, _session_date),
    'session', json_build_object(
      'date', _session_date,
      'total_slots', _total_slots,
      'booked_count', (
        SELECT COUNT(*)
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'booked_units', (
        SELECT COALESCE(SUM(CEIL(COALESCE(duration, _hotel.slot_interval)::NUMERIC / _hotel.slot_interval)), 0)
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'unique_clients', (
        SELECT COUNT(DISTINCT LOWER(TRIM(
          COALESCE(client_email, client_first_name || ' ' || client_last_name)
        )))
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'bookings', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'id', b.id,
            'booking_time', b.booking_time,
            'duration', COALESCE(b.duration, _hotel.slot_interval),
            'client_first_name', b.client_first_name,
            'client_last_name', LEFT(b.client_last_name, 1) || '.',
            'status', b.status,
            'treatments', (
              SELECT COALESCE(json_agg(json_build_object(
                'name', tm.name,
                'duration', tm.duration
              )), '[]'::JSON)
              FROM booking_treatments bt
              JOIN treatment_menus tm ON tm.id = bt.treatment_id
              WHERE bt.booking_id = b.id
            )
          ) ORDER BY b.booking_time
        ), '[]'::JSON)
        FROM bookings b
        WHERE b.hotel_id = _hotel_id
          AND b.booking_date = _session_date
          AND b.status NOT IN ('Annulé', 'cancelled')
      ),
      'blocked_slots', (
        SELECT COALESCE(json_agg(json_build_object(
          'label', vbs.label,
          'start_time', vbs.start_time,
          'end_time', vbs.end_time
        )), '[]'::JSON)
        FROM venue_blocked_slots vbs
        WHERE vbs.hotel_id = _hotel_id
          AND vbs.is_active = true
          AND (vbs.days_of_week IS NULL OR _day_of_week = ANY(vbs.days_of_week))
      ),
      'popular_treatments', (
        SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::JSON)
        FROM (
          SELECT tm.name, COUNT(*)::INTEGER as count
          FROM bookings b
          JOIN booking_treatments bt ON bt.booking_id = b.id
          JOIN treatment_menus tm ON tm.id = bt.treatment_id
          WHERE b.hotel_id = _hotel_id
            AND b.booking_date = _session_date
            AND b.status NOT IN ('Annulé', 'cancelled')
          GROUP BY tm.name
          ORDER BY count DESC
          LIMIT 5
        ) t
      )
    )
  ) INTO _result;

  RETURN _result;
END;
$$;
