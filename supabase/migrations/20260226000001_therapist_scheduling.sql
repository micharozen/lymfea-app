-- ============================================================
-- Therapist Scheduling: weekly templates + materialized availability
-- ============================================================

-- 1. Weekly template (one per therapist)
-- weekly_pattern: JSONB array of 7 objects (index 0=Monday, 6=Sunday)
-- Each: { "enabled": boolean, "shifts": [{"start": "HH:MM", "end": "HH:MM"}, ...] }
CREATE TABLE therapist_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  weekly_pattern JSONB NOT NULL DEFAULT '[
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []},
    {"enabled": false, "shifts": []}
  ]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_therapist_template UNIQUE (therapist_id)
);

-- 2. Materialized day-level availability (source of truth for check-availability)
CREATE TABLE therapist_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_manually_edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_therapist_date UNIQUE (therapist_id, date)
);

-- Indexes for the availability engine
CREATE INDEX idx_therapist_availability_date
  ON therapist_availability (date, therapist_id) WHERE is_available = true;
CREATE INDEX idx_therapist_availability_range
  ON therapist_availability (therapist_id, date);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE therapist_schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapist_availability ENABLE ROW LEVEL SECURITY;

-- Therapists: own data only
CREATE POLICY "therapist_own_template_select" ON therapist_schedule_templates
  FOR SELECT USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_template_insert" ON therapist_schedule_templates
  FOR INSERT WITH CHECK (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_template_update" ON therapist_schedule_templates
  FOR UPDATE USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );

CREATE POLICY "therapist_own_availability_select" ON therapist_availability
  FOR SELECT USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_availability_insert" ON therapist_availability
  FOR INSERT WITH CHECK (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_availability_update" ON therapist_availability
  FOR UPDATE USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_availability_delete" ON therapist_availability
  FOR DELETE USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );

-- Admins: full access
CREATE POLICY "admin_all_templates" ON therapist_schedule_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "admin_all_availability" ON therapist_availability
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Service role (edge functions): full access via SECURITY DEFINER on RPC

-- ============================================================
-- RPC: apply_schedule_template
-- Generates therapist_availability rows for a given month from the weekly template.
-- Respects is_manually_edited flag (won't overwrite unless _overwrite_manual = true).
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
    -- ISODOW: 1=Monday..7=Sunday → convert to 0-based (0=Monday..6=Sunday)
    _day_of_week := EXTRACT(ISODOW FROM _current_date)::int - 1;
    _day_config := _weekly_pattern->_day_of_week;

    INSERT INTO therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited)
    VALUES (
      _therapist_id,
      _current_date,
      COALESCE((_day_config->>'enabled')::boolean, false),
      COALESCE(_day_config->'shifts', '[]'::jsonb),
      false
    )
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      shifts = EXCLUDED.shifts,
      is_manually_edited = false,
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
