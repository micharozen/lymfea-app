-- Fix: operator does not exist: text = date
-- The specific_dates column is DATE[], so compare DATE = ANY(DATE[]) instead of TEXT = ANY(DATE[])
CREATE OR REPLACE FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    RETURN _schedule.specific_dates IS NOT NULL AND _check_date = ANY(_schedule.specific_dates);
  END IF;

  -- Default: not available
  RETURN FALSE;
END;
$$;
