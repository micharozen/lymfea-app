-- ============================================================
-- Hotel Audit Trigger — track changes to venue (hotels) records
-- Reuses the existing audit_log table (20260228000001)
-- Generic column diff (hotels has ~50 columns), unlike the
-- booking trigger which lists tracked columns explicitly.
-- ============================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION log_hotel_change()
RETURNS TRIGGER AS $$
DECLARE
  _old JSONB := '{}'::jsonb;
  _new JSONB := '{}'::jsonb;
  _old_row JSONB := to_jsonb(OLD);
  _new_row JSONB := to_jsonb(NEW);
  _key TEXT;
  _ignore TEXT[] := ARRAY['updated_at', 'created_at', 'id', 'organization_id'];
BEGIN
  -- On INSERT: log the initial creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (
      table_name, record_id, changed_by, change_type,
      old_values, new_values, source
    ) VALUES (
      'hotels',
      NEW.id::text,
      auth.uid(),
      'insert',
      NULL,
      jsonb_build_object('name', NEW.name, 'status', NEW.status),
      'admin'
    );
    RETURN NEW;
  END IF;

  -- Compare every column; record only those that actually changed
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _key = ANY(_ignore) THEN
      CONTINUE;
    END IF;
    IF (_old_row -> _key) IS DISTINCT FROM (_new_row -> _key) THEN
      _old := _old || jsonb_build_object(_key, _old_row -> _key);
      _new := _new || jsonb_build_object(_key, _new_row -> _key);
    END IF;
  END LOOP;

  -- Skip if nothing tracked changed
  IF _new = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source
  ) VALUES (
    'hotels',
    NEW.id::text,
    auth.uid(),
    'update',
    _old,
    _new,
    'admin'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger
CREATE TRIGGER trg_hotel_audit
  AFTER INSERT OR UPDATE ON hotels
  FOR EACH ROW
  EXECUTE FUNCTION log_hotel_change();

-- 3. Index for fast lookup by hotel
CREATE INDEX idx_audit_log_hotels
  ON audit_log (record_id, changed_at DESC)
  WHERE table_name = 'hotels';
