-- Add recurrence_interval column to venue_deployment_schedules
ALTER TABLE public.venue_deployment_schedules
ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER NOT NULL DEFAULT 1;

-- Add a constraint to ensure interval is at least 1
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurrence_interval_positive'
  ) THEN
    ALTER TABLE public.venue_deployment_schedules
    ADD CONSTRAINT recurrence_interval_positive CHECK (recurrence_interval >= 1);
  END IF;
END
$$;

COMMENT ON COLUMN public.venue_deployment_schedules.recurrence_interval IS
  'Number of weeks between recurrences. 1 = every week, 2 = every other week, etc. Only applies when schedule_type = specific_days';

-- Create or replace is_venue_available_on_date function (single version with DATE parameter)
-- Note: Only keeping the DATE version as it's called internally by get_venue_available_dates
DROP FUNCTION IF EXISTS public.is_venue_available_on_date(text, date);
DROP FUNCTION IF EXISTS public.is_venue_available_on_date(text, text);

CREATE OR REPLACE FUNCTION public.is_venue_available_on_date(
  _hotel_id TEXT,
  _check_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _schedule RECORD;
  _day_of_week INTEGER;
  _weeks_since_start INTEGER;
  _start_date DATE;
BEGIN
  -- Fetch the schedule for this venue
  SELECT
    schedule_type,
    days_of_week,
    recurring_start_date,
    recurring_end_date,
    specific_dates,
    COALESCE(recurrence_interval, 1) as recurrence_interval
  INTO _schedule
  FROM public.venue_deployment_schedules
  WHERE hotel_id = _hotel_id;

  -- If no schedule found, assume always available (backward compatibility)
  IF _schedule IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Handle always_open: venue is always available
  IF _schedule.schedule_type = 'always_open' THEN
    RETURN TRUE;
  END IF;

  -- Handle specific_days with recurrence interval
  IF _schedule.schedule_type = 'specific_days' THEN
    _start_date := COALESCE(_schedule.recurring_start_date, CURRENT_DATE);

    -- Check if we're before the start date
    IF _check_date < _start_date THEN
      RETURN FALSE;
    END IF;

    -- Check if we're after the end date
    IF _schedule.recurring_end_date IS NOT NULL AND _check_date > _schedule.recurring_end_date THEN
      RETURN FALSE;
    END IF;

    -- Check if the day of week matches (0=Sunday, 1=Monday, etc.)
    _day_of_week := EXTRACT(DOW FROM _check_date)::INTEGER;

    IF _schedule.days_of_week IS NULL OR NOT (_day_of_week = ANY(_schedule.days_of_week)) THEN
      RETURN FALSE;
    END IF;

    -- Check recurrence interval
    -- Week 0 is the start week, then every N weeks after
    IF _schedule.recurrence_interval > 1 THEN
      _weeks_since_start := FLOOR((_check_date - _start_date) / 7)::INTEGER;
      IF (_weeks_since_start % _schedule.recurrence_interval) != 0 THEN
        RETURN FALSE;
      END IF;
    END IF;

    RETURN TRUE;
  END IF;

  -- Handle one_time: check if date is in the specific_dates array
  IF _schedule.schedule_type = 'one_time' THEN
    RETURN _schedule.specific_dates IS NOT NULL AND _check_date::TEXT = ANY(_schedule.specific_dates);
  END IF;

  -- Default: not available
  RETURN FALSE;
END;
$$;

-- Create or replace get_venue_available_dates function (single version with TEXT parameters)
-- Note: Only keeping the TEXT version to avoid PostgREST PGRST203 ambiguity error
DROP FUNCTION IF EXISTS public.get_venue_available_dates(text, date, date);
DROP FUNCTION IF EXISTS public.get_venue_available_dates(text, text, text);

CREATE OR REPLACE FUNCTION public.get_venue_available_dates(
  _hotel_id TEXT,
  _start_date TEXT,
  _end_date TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _available_dates TEXT[] := ARRAY[]::TEXT[];
  _current_date DATE;
BEGIN
  _current_date := _start_date::DATE;

  WHILE _current_date <= _end_date::DATE LOOP
    IF public.is_venue_available_on_date(_hotel_id, _current_date) THEN
      _available_dates := array_append(_available_dates, _current_date::TEXT);
    END IF;
    _current_date := _current_date + INTERVAL '1 day';
  END LOOP;

  RETURN _available_dates;
END;
$$;

-- Update get_public_hotel_by_id to include recurrence_interval and date range
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  id text,
  name text,
  image text,
  cover_image text,
  city text,
  country text,
  currency text,
  status text,
  vat numeric,
  opening_time time,
  closing_time time,
  schedule_type text,
  days_of_week integer[],
  recurrence_interval integer,
  recurring_start_date date,
  recurring_end_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
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
    vds.recurring_end_date
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;
