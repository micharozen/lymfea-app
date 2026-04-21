-- ============================================================
-- Booking Audit Trigger — track changes to key booking fields
-- Reuses the existing audit_log table (20260228000001)
-- ============================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION log_booking_change()
RETURNS TRIGGER AS $$
DECLARE
  _old JSONB := '{}'::jsonb;
  _new JSONB := '{}'::jsonb;
  _changed BOOLEAN := false;
BEGIN
  -- On INSERT: log the initial creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (
      table_name, record_id, changed_by, change_type,
      old_values, new_values, source, metadata
    ) VALUES (
      'bookings',
      NEW.id::text,
      auth.uid(),
      'insert',
      NULL,
      jsonb_build_object(
        'status', NEW.status,
        'payment_status', NEW.payment_status,
        'therapist_name', NEW.therapist_name,
        'booking_date', NEW.booking_date,
        'booking_time', NEW.booking_time,
        'total_price', NEW.total_price
      ),
      'admin',
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'therapist_id', COALESCE(NEW.therapist_id::text, '')
      )
    );
    RETURN NEW;
  END IF;

  -- Compare each tracked field; record only those that changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _old := _old || jsonb_build_object('status', OLD.status);
    _new := _new || jsonb_build_object('status', NEW.status);
    _changed := true;
  END IF;

  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    _old := _old || jsonb_build_object('payment_status', OLD.payment_status);
    _new := _new || jsonb_build_object('payment_status', NEW.payment_status);
    _changed := true;
  END IF;

  IF OLD.therapist_id IS DISTINCT FROM NEW.therapist_id THEN
    _old := _old || jsonb_build_object('therapist_id', OLD.therapist_id, 'therapist_name', OLD.therapist_name);
    _new := _new || jsonb_build_object('therapist_id', NEW.therapist_id, 'therapist_name', NEW.therapist_name);
    _changed := true;
  END IF;

  IF OLD.booking_date IS DISTINCT FROM NEW.booking_date THEN
    _old := _old || jsonb_build_object('booking_date', OLD.booking_date);
    _new := _new || jsonb_build_object('booking_date', NEW.booking_date);
    _changed := true;
  END IF;

  IF OLD.booking_time IS DISTINCT FROM NEW.booking_time THEN
    _old := _old || jsonb_build_object('booking_time', OLD.booking_time);
    _new := _new || jsonb_build_object('booking_time', NEW.booking_time);
    _changed := true;
  END IF;

  IF OLD.duration IS DISTINCT FROM NEW.duration THEN
    _old := _old || jsonb_build_object('duration', OLD.duration);
    _new := _new || jsonb_build_object('duration', NEW.duration);
    _changed := true;
  END IF;

  IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
    _old := _old || jsonb_build_object('total_price', OLD.total_price);
    _new := _new || jsonb_build_object('total_price', NEW.total_price);
    _changed := true;
  END IF;

  IF OLD.payment_method IS DISTINCT FROM NEW.payment_method THEN
    _old := _old || jsonb_build_object('payment_method', OLD.payment_method);
    _new := _new || jsonb_build_object('payment_method', NEW.payment_method);
    _changed := true;
  END IF;

  IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    _old := _old || jsonb_build_object('room_id', OLD.room_id);
    _new := _new || jsonb_build_object('room_id', NEW.room_id);
    _changed := true;
  END IF;

  -- Skip if nothing tracked changed
  IF NOT _changed THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata
  ) VALUES (
    'bookings',
    NEW.id::text,
    auth.uid(),
    'update',
    _old,
    _new,
    'admin',
    jsonb_build_object(
      'booking_id', NEW.booking_id,
      'therapist_id', COALESCE(NEW.therapist_id::text, '')
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger
CREATE TRIGGER trg_booking_audit
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_change();

-- 3. Index for fast lookup by booking
CREATE INDEX idx_audit_log_bookings
  ON audit_log (record_id, changed_at DESC)
  WHERE table_name = 'bookings';

-- 4. RLS: let therapists see audit logs for their own bookings
CREATE POLICY "therapist_booking_audit_log" ON audit_log
  FOR SELECT USING (
    table_name = 'bookings'
    AND EXISTS (
      SELECT 1 FROM bookings b
      JOIN therapists t ON t.id = b.therapist_id
      WHERE b.id::text = audit_log.record_id
        AND t.user_id = auth.uid()
    )
  );
