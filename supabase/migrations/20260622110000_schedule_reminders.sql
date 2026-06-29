-- Schedule reminder logs, completeness RPCs, template fix, biweekly cron.

-- ---------------------------------------------------------------------------
-- 1. Reminder logs (dedup via sent_at within 14 days)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('biweekly')),
  target_month text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (therapist_id, reminder_type, target_month)
);

CREATE INDEX IF NOT EXISTS idx_schedule_reminder_logs_therapist
  ON public.schedule_reminder_logs (therapist_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_reminder_logs_dedup
  ON public.schedule_reminder_logs (therapist_id, reminder_type, sent_at DESC);

ALTER TABLE public.schedule_reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_schedule_reminder_logs"
  ON public.schedule_reminder_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. apply_schedule_template — clear disabled weekdays even if manually edited
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_schedule_template(
  _therapist_id UUID,
  _year INT,
  _month INT,
  _weekly_pattern JSONB,
  _overwrite_manual BOOLEAN DEFAULT false
) RETURNS INT AS $$
DECLARE
  _start_date DATE;
  _end_date DATE;
  _current_date DATE;
  _day_of_week INT;
  _day_config JSONB;
  _day_enabled BOOLEAN;
  _affected INT := 0;
BEGIN
  _start_date := make_date(_year, _month, 1);
  _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;
  _current_date := _start_date;

  WHILE _current_date <= _end_date LOOP
    _day_of_week := EXTRACT(ISODOW FROM _current_date)::int - 1;
    _day_config := _weekly_pattern->_day_of_week;
    _day_enabled := COALESCE((_day_config->>'enabled')::boolean, false);

    INSERT INTO therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (
      _therapist_id,
      _current_date,
      _day_enabled,
      CASE
        WHEN _day_enabled THEN COALESCE(_day_config->'shifts', '[]'::jsonb)
        ELSE '[]'::jsonb
      END,
      false,
      'template_apply'
    )
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      shifts = EXCLUDED.shifts,
      is_manually_edited = false,
      last_change_source = 'template_apply',
      updated_at = now()
    WHERE _overwrite_manual
      OR NOT therapist_availability.is_manually_edited
      OR NOT _day_enabled;

    IF FOUND THEN
      _affected := _affected + 1;
    END IF;

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ---------------------------------------------------------------------------
-- 3. get_schedule_completeness — single source of truth (Europe/Paris horizon)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_schedule_completeness(p_therapist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _horizon_days constant int := 14;
  _tz constant text := 'Europe/Paris';
  _start_date date := (timezone(_tz, now()))::date;
  _end_date date := _start_date + (_horizon_days - 1);
  _weekly_pattern jsonb;
  _has_template boolean := false;
  _declared_days int := 0;
  _expected_days int := 0;
  _status text;
  _is_incomplete boolean;
  _d date;
  _day_index int;
  _day_config jsonb;
  _i int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.id = p_therapist_id AND t.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  SELECT weekly_pattern INTO _weekly_pattern
  FROM therapist_schedule_templates
  WHERE therapist_id = p_therapist_id;

  IF _weekly_pattern IS NOT NULL AND jsonb_typeof(_weekly_pattern) = 'array' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_weekly_pattern) AS elem
      WHERE COALESCE((elem->>'enabled')::boolean, false)
        AND jsonb_array_length(COALESCE(elem->'shifts', '[]'::jsonb)) > 0
    ) INTO _has_template;
  END IF;

  SELECT COUNT(*)::int INTO _declared_days
  FROM therapist_availability ta
  WHERE ta.therapist_id = p_therapist_id
    AND ta.date BETWEEN _start_date AND _end_date
    AND ta.is_available = true
    AND jsonb_array_length(COALESCE(ta.shifts, '[]'::jsonb)) > 0;

  IF _weekly_pattern IS NOT NULL AND jsonb_typeof(_weekly_pattern) = 'array' THEN
    _d := _start_date;
    FOR _i IN 1.._horizon_days LOOP
      _day_index := EXTRACT(ISODOW FROM _d)::int - 1;
      _day_config := _weekly_pattern->_day_index;
      IF COALESCE((_day_config->>'enabled')::boolean, false)
         AND jsonb_array_length(COALESCE(_day_config->'shifts', '[]'::jsonb)) > 0 THEN
        _expected_days := _expected_days + 1;
      END IF;
      _d := _d + 1;
    END LOOP;
  END IF;

  IF NOT _has_template THEN
    _status := 'no_template';
  ELSIF _declared_days = 0 THEN
    _status := 'template_not_applied';
  ELSIF _expected_days > 0 AND _declared_days < _expected_days THEN
    _status := 'partial';
  ELSE
    _status := 'complete';
  END IF;

  _is_incomplete := _status IN ('no_template', 'template_not_applied');

  RETURN jsonb_build_object(
    'status', _status,
    'is_incomplete', _is_incomplete,
    'declared_days_count', _declared_days,
    'expected_days_count', _expected_days,
    'horizon_days', _horizon_days,
    'has_template', _has_template,
    'weekly_pattern', _weekly_pattern
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Bulk incomplete therapists for cron (one DB round-trip)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_incomplete_schedule_therapist_ids(
  p_dedup_days int DEFAULT 14,
  p_reminder_type text DEFAULT 'biweekly'
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH active_therapists AS (
    SELECT DISTINCT t.id
    FROM therapists t
    INNER JOIN therapist_venues tv ON tv.therapist_id = t.id
    WHERE t.user_id IS NOT NULL
      AND COALESCE(t.status, '') IN ('Active', 'Actif', 'active')
  ),
  recently_reminded AS (
    SELECT DISTINCT srl.therapist_id
    FROM schedule_reminder_logs srl
    WHERE srl.reminder_type = p_reminder_type
      AND srl.sent_at >= now() - (p_dedup_days || ' days')::interval
  )
  SELECT a.id
  FROM active_therapists a
  LEFT JOIN recently_reminded r ON r.therapist_id = a.id
  WHERE r.therapist_id IS NULL
    AND (public.get_schedule_completeness(a.id)->>'is_incomplete')::boolean = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_completeness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_completeness(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_incomplete_schedule_therapist_ids(int, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Biweekly cron — Monday 9h UTC
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-schedule-reminder-weekly') THEN
      PERFORM cron.unschedule('send-schedule-reminder-weekly');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-schedule-reminder-monthly') THEN
      PERFORM cron.unschedule('send-schedule-reminder-monthly');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-schedule-reminder-biweekly') THEN
      PERFORM cron.unschedule('send-schedule-reminder-biweekly');
    END IF;

    PERFORM cron.schedule(
      'send-schedule-reminder-biweekly',
      '0 9 * * 1',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/send-schedule-reminder'
      )
    );

    RAISE NOTICE 'Cron enregistré : send-schedule-reminder-biweekly';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — crons ignorés (environnement local)';
  END IF;
END;
$$;
