-- ============================================================
-- Therapist Absences: multi-day blocking (vacation, sick, other)
-- ============================================================

-- 1. Create the therapist_absences table
CREATE TABLE public.therapist_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('vacation', 'sick', 'other')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Indexes
CREATE INDEX idx_therapist_absences_therapist_date
  ON public.therapist_absences (therapist_id, start_date, end_date);
CREATE INDEX idx_therapist_absences_date_range
  ON public.therapist_absences (start_date, end_date);

-- 2. RLS policies
ALTER TABLE public.therapist_absences ENABLE ROW LEVEL SECURITY;

-- Therapists can manage their own absences
CREATE POLICY "therapist_own_absences_select" ON public.therapist_absences
  FOR SELECT USING (
    therapist_id IN (SELECT id FROM public.therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_absences_insert" ON public.therapist_absences
  FOR INSERT WITH CHECK (
    therapist_id IN (SELECT id FROM public.therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_absences_update" ON public.therapist_absences
  FOR UPDATE USING (
    therapist_id IN (SELECT id FROM public.therapists WHERE user_id = auth.uid())
  );
CREATE POLICY "therapist_own_absences_delete" ON public.therapist_absences
  FOR DELETE USING (
    therapist_id IN (SELECT id FROM public.therapists WHERE user_id = auth.uid())
  );

-- Admins have full access
CREATE POLICY "admin_all_absences" ON public.therapist_absences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 3. RPC: create absence + sync to therapist_availability
CREATE OR REPLACE FUNCTION public.create_therapist_absence(
  _therapist_id UUID,
  _start_date DATE,
  _end_date DATE,
  _reason TEXT,
  _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _absence_id UUID;
  _current_date DATE;
BEGIN
  -- Validate reason
  IF _reason NOT IN ('vacation', 'sick', 'other') THEN
    RAISE EXCEPTION 'Invalid reason: %', _reason;
  END IF;

  -- Validate date range
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;

  -- Insert the absence record
  INSERT INTO public.therapist_absences (therapist_id, start_date, end_date, reason, note)
  VALUES (_therapist_id, _start_date, _end_date, _reason, _note)
  RETURNING id INTO _absence_id;

  -- Sync to therapist_availability: mark each day as unavailable
  _current_date := _start_date;
  WHILE _current_date <= _end_date LOOP
    INSERT INTO public.therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (_therapist_id, _current_date, false, '[]'::jsonb, true, 'absence')
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = false,
      shifts = '[]'::jsonb,
      is_manually_edited = true,
      last_change_source = 'absence',
      updated_at = now();

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _absence_id;
END;
$$;

-- 4. RPC: delete absence + restore availability
CREATE OR REPLACE FUNCTION public.delete_therapist_absence(
  _absence_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _absence RECORD;
  _current_date DATE;
  _other_absence_exists BOOLEAN;
BEGIN
  -- Get the absence to delete
  SELECT * INTO _absence FROM public.therapist_absences WHERE id = _absence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Absence not found';
  END IF;

  -- Delete the absence record
  DELETE FROM public.therapist_absences WHERE id = _absence_id;

  -- For each day in the range, check if another absence still covers it
  _current_date := _absence.start_date;
  WHILE _current_date <= _absence.end_date LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.therapist_absences
      WHERE therapist_id = _absence.therapist_id
        AND _current_date BETWEEN start_date AND end_date
    ) INTO _other_absence_exists;

    IF NOT _other_absence_exists THEN
      -- No other absence covers this day: remove the availability override
      -- Only delete if it was created by the absence system
      DELETE FROM public.therapist_availability
      WHERE therapist_id = _absence.therapist_id
        AND date = _current_date
        AND last_change_source = 'absence';
    END IF;

    _current_date := _current_date + 1;
  END LOOP;
END;
$$;
