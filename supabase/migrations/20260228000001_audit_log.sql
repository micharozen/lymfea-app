-- ============================================================
-- Generic Audit Log + Schedule Change Trigger
-- ============================================================

-- 1. Generic audit_log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL CHECK (change_type IN ('insert', 'update', 'delete', 'action')),
  old_values JSONB,
  new_values JSONB,
  source TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_type TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Indexes
CREATE INDEX idx_audit_log_flags
  ON audit_log (is_flagged, acknowledged_at)
  WHERE is_flagged = true AND acknowledged_at IS NULL;

CREATE INDEX idx_audit_log_table_record
  ON audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX idx_audit_log_table_date
  ON audit_log (table_name, changed_at DESC);

CREATE INDEX idx_audit_log_metadata_therapist
  ON audit_log ((metadata->>'therapist_id'))
  WHERE table_name = 'therapist_availability';

-- 3. RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_audit_log" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_update_audit_log" ON audit_log
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "therapist_own_audit_log" ON audit_log
  FOR SELECT USING (
    table_name = 'therapist_availability'
    AND (metadata->>'therapist_id') IN (
      SELECT id::text FROM therapists WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Add last_change_source to therapist_availability
-- ============================================================

ALTER TABLE therapist_availability
  ADD COLUMN last_change_source TEXT NOT NULL DEFAULT 'unknown';

-- ============================================================
-- 5. Trigger: log manual schedule changes (skip template_apply)
-- ============================================================

CREATE OR REPLACE FUNCTION log_therapist_availability_change()
RETURNS TRIGGER AS $$
DECLARE
  _source TEXT;
  _affected_date DATE;
  _therapist_id UUID;
  _old_values JSONB;
  _new_values JSONB;
  _is_red_flag BOOLEAN;
  _record_id TEXT;
BEGIN
  -- Determine source
  IF TG_OP = 'DELETE' THEN
    _source := COALESCE(OLD.last_change_source, 'unknown');
    _affected_date := OLD.date;
    _therapist_id := OLD.therapist_id;
    _record_id := OLD.id::text;
  ELSE
    _source := COALESCE(NEW.last_change_source, 'unknown');
    _affected_date := NEW.date;
    _therapist_id := NEW.therapist_id;
    _record_id := NEW.id::text;
  END IF;

  -- Skip template applications (bulk operations)
  IF _source = 'template_apply' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Skip if no meaningful fields changed (UPDATE only)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_available IS NOT DISTINCT FROM NEW.is_available
       AND OLD.shifts IS NOT DISTINCT FROM NEW.shifts
       AND OLD.is_manually_edited IS NOT DISTINCT FROM NEW.is_manually_edited THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build old/new values
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _old_values := jsonb_build_object(
      'is_available', OLD.is_available,
      'shifts', OLD.shifts,
      'is_manually_edited', OLD.is_manually_edited
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _new_values := jsonb_build_object(
      'is_available', NEW.is_available,
      'shifts', NEW.shifts,
      'is_manually_edited', NEW.is_manually_edited
    );
  END IF;

  -- Red flag: affected date is less than 14 days from now
  _is_red_flag := (_affected_date < CURRENT_DATE + INTERVAL '14 days');

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata,
    is_flagged, flag_type
  ) VALUES (
    'therapist_availability',
    _record_id,
    auth.uid(),
    lower(TG_OP),
    _old_values,
    _new_values,
    _source,
    jsonb_build_object('therapist_id', _therapist_id::text, 'affected_date', _affected_date::text),
    _is_red_flag,
    CASE WHEN _is_red_flag THEN 'short_notice' ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_therapist_availability_audit
  AFTER INSERT OR UPDATE OR DELETE ON therapist_availability
  FOR EACH ROW
  EXECUTE FUNCTION log_therapist_availability_change();

-- ============================================================
-- 6. Update apply_schedule_template to set last_change_source
-- ============================================================

CREATE OR REPLACE FUNCTION apply_schedule_template(
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
  _affected INT := 0;
BEGIN
  _start_date := make_date(_year, _month, 1);
  _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;
  _current_date := _start_date;

  WHILE _current_date <= _end_date LOOP
    _day_of_week := EXTRACT(ISODOW FROM _current_date)::int - 1;
    _day_config := _weekly_pattern->_day_of_week;

    INSERT INTO therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (
      _therapist_id,
      _current_date,
      COALESCE((_day_config->>'enabled')::boolean, false),
      COALESCE(_day_config->'shifts', '[]'::jsonb),
      false,
      'template_apply'
    )
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      shifts = EXCLUDED.shifts,
      is_manually_edited = false,
      last_change_source = 'template_apply',
      updated_at = now()
    WHERE _overwrite_manual OR NOT therapist_availability.is_manually_edited;

    IF FOUND THEN
      _affected := _affected + 1;
    END IF;

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Generic RPC: create_audit_log
-- ============================================================

CREATE OR REPLACE FUNCTION create_audit_log(
  _table_name TEXT,
  _record_id TEXT,
  _change_type TEXT,
  _old_values JSONB DEFAULT NULL,
  _new_values JSONB DEFAULT NULL,
  _source TEXT DEFAULT 'unknown',
  _metadata JSONB DEFAULT '{}'::jsonb,
  _is_flagged BOOLEAN DEFAULT false,
  _flag_type TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  _id UUID;
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata,
    is_flagged, flag_type
  ) VALUES (
    _table_name, _record_id, auth.uid(), _change_type,
    _old_values, _new_values, _source, _metadata,
    _is_flagged, _flag_type
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. RPCs: acknowledge alerts
-- ============================================================

CREATE OR REPLACE FUNCTION acknowledge_audit_alert(
  _alert_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE audit_log
  SET acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = _alert_id
    AND is_flagged = true
    AND acknowledged_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION acknowledge_audit_alerts_bulk(
  _alert_ids UUID[]
) RETURNS INT AS $$
DECLARE
  _count INT;
BEGIN
  UPDATE audit_log
  SET acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = ANY(_alert_ids)
    AND is_flagged = true
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
