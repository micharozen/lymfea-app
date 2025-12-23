-- 1. Update existing booking status values to English
UPDATE public.bookings SET status = 'pending' WHERE status = 'En attente';
UPDATE public.bookings SET status = 'assigned' WHERE status = 'Assigné';
UPDATE public.bookings SET status = 'confirmed' WHERE status = 'Confirmé';
UPDATE public.bookings SET status = 'completed' WHERE status = 'Terminé';
UPDATE public.bookings SET status = 'cancelled' WHERE status = 'Annulé';
UPDATE public.bookings SET status = 'awaiting_validation' WHERE status = 'En attente de validation';

-- 2. Update default value for bookings.status
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';

-- 3. Update entity status defaults (hotels, treatment_menus, etc.)
UPDATE public.hotels SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.hotels SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';
ALTER TABLE public.hotels ALTER COLUMN status SET DEFAULT 'active';

UPDATE public.treatment_menus SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.treatment_menus SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';

UPDATE public.hairdressers SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.hairdressers SET status = 'pending' WHERE status = 'pending' OR status = 'En attente';
UPDATE public.hairdressers SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';

UPDATE public.concierges SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.concierges SET status = 'pending' WHERE status = 'pending' OR status = 'En attente';
UPDATE public.concierges SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';

UPDATE public.admins SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.admins SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';

UPDATE public.trunks SET status = 'active' WHERE status = 'Active' OR status = 'Actif';
UPDATE public.trunks SET status = 'inactive' WHERE status = 'Inactive' OR status = 'Inactif';
UPDATE public.trunks SET status = 'maintenance' WHERE status = 'Maintenance';

-- 4. Drop and recreate RLS policies with English status values

-- Drop existing policies that reference French status
DROP POLICY IF EXISTS "Hairdressers can view pending bookings from their hotels" ON public.bookings;
DROP POLICY IF EXISTS "Hairdressers can create treatments for pending bookings in thei" ON public.booking_treatments;
DROP POLICY IF EXISTS "Hairdressers can delete treatments for pending bookings in thei" ON public.booking_treatments;
DROP POLICY IF EXISTS "Hairdressers can view treatments for pending bookings" ON public.booking_treatments;

-- Recreate policies with English status
CREATE POLICY "Hairdressers can view pending bookings from their hotels" 
ON public.bookings FOR SELECT
USING (
  has_role(auth.uid(), 'hairdresser'::app_role) 
  AND status = 'pending'
  AND hairdresser_id IS NULL 
  AND hotel_id IN (
    SELECT hh.hotel_id FROM hairdresser_hotels hh 
    WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
  )
  AND NOT (get_hairdresser_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
);

CREATE POLICY "Hairdressers can create treatments for pending bookings in thei" 
ON public.booking_treatments FOR INSERT
WITH CHECK (
  booking_id IN (
    SELECT b.id FROM bookings b
    WHERE b.status = 'pending'
    AND b.hairdresser_id IS NULL 
    AND b.hotel_id IN (
      SELECT hh.hotel_id FROM hairdresser_hotels hh 
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
  )
);

CREATE POLICY "Hairdressers can delete treatments for pending bookings in thei" 
ON public.booking_treatments FOR DELETE
USING (
  booking_id IN (
    SELECT b.id FROM bookings b
    WHERE b.status = 'pending'
    AND b.hairdresser_id IS NULL 
    AND b.hotel_id IN (
      SELECT hh.hotel_id FROM hairdresser_hotels hh 
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
  )
);

CREATE POLICY "Hairdressers can view treatments for pending bookings" 
ON public.booking_treatments FOR SELECT
USING (
  booking_id IN (
    SELECT b.id FROM bookings b
    WHERE b.status = 'pending'
    AND b.hairdresser_id IS NULL 
    AND b.hotel_id IN (
      SELECT hh.hotel_id FROM hairdresser_hotels hh 
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
  )
);

-- 5. Update database functions to use English status values

-- Update accept_booking function
CREATE OR REPLACE FUNCTION public.accept_booking(_booking_id uuid, _hairdresser_id uuid, _hairdresser_name text, _total_price numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
BEGIN
  SELECT hairdresser_id INTO _current_hairdresser_id
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NOT NULL AND _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = _hairdresser_id,
    hairdresser_name = _hairdresser_name,
    status = 'confirmed',
    assigned_at = now(),
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'hairdresser_id', hairdresser_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$function$;

-- Update unassign_booking function
CREATE OR REPLACE FUNCTION public.unassign_booking(_booking_id uuid, _hairdresser_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
  _current_declined_by uuid[];
BEGIN
  SELECT hairdresser_id, COALESCE(declined_by, ARRAY[]::uuid[]) 
  INTO _current_hairdresser_id, _current_declined_by
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NULL OR _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_assigned_to_you');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = NULL,
    hairdresser_name = NULL,
    status = 'pending',
    assigned_at = NULL,
    declined_by = array_append(_current_declined_by, _hairdresser_id),
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$function$;

-- Update notify_admins_on_completion_request function
CREATE OR REPLACE FUNCTION public.notify_admins_on_completion_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
BEGIN
  IF NEW.status = 'awaiting_validation' AND (OLD.status IS NULL OR OLD.status != 'awaiting_validation') THEN
    FOR admin_record IN (
      SELECT a.user_id, a.first_name, a.last_name
      FROM public.admins a
      WHERE a.user_id IS NOT NULL
        AND a.status = 'active'
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        admin_record.user_id,
        NEW.id,
        'completion_request',
        'Demande de validation pour la réservation #' || NEW.booking_id || 
        ' - ' || NEW.client_first_name || ' ' || NEW.client_last_name || 
        ' à ' || COALESCE(NEW.hotel_name, 'l''hôtel') || 
        ' le ' || TO_CHAR(NEW.booking_date, 'DD/MM/YYYY')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update notify_hairdressers_on_unassignment function
CREATE OR REPLACE FUNCTION public.notify_hairdressers_on_unassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hairdresser_record RECORD;
BEGIN
  IF OLD.hairdresser_id IS NOT NULL AND 
     NEW.hairdresser_id IS NULL AND 
     NEW.status = 'pending' THEN
    
    FOR hairdresser_record IN (
      SELECT h.user_id, h.first_name, h.last_name, h.id
      FROM public.hairdressers h
      INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
      WHERE hh.hotel_id = NEW.hotel_id
        AND h.user_id IS NOT NULL
        AND h.status = 'active'
        AND NOT (h.id = ANY(COALESCE(NEW.declined_by, ARRAY[]::uuid[])))
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_record.user_id,
        NEW.id,
        'booking_reproposed',
        'La réservation #' || NEW.booking_id || ' est à nouveau disponible à ' || 
        COALESCE(NEW.hotel_name, 'l''hôtel') || ' pour le ' || 
        TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') || ' à ' || 
        TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update notify_hairdresser_on_cancellation function
CREATE OR REPLACE FUNCTION public.notify_hairdresser_on_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hairdresser_user_id UUID;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.hairdresser_id IS NOT NULL THEN
    SELECT user_id INTO hairdresser_user_id
    FROM public.hairdressers
    WHERE id = NEW.hairdresser_id;

    IF hairdresser_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_user_id,
        NEW.id,
        'booking_cancelled',
        'La réservation #' || NEW.booking_id || ' a été annulée' || 
        CASE 
          WHEN NEW.cancellation_reason IS NOT NULL AND NEW.cancellation_reason != '' 
          THEN '. Raison : ' || NEW.cancellation_reason 
          ELSE '' 
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update notify_hairdressers_new_booking function
CREATE OR REPLACE FUNCTION public.notify_hairdressers_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hairdresser_record RECORD;
BEGIN
  IF NEW.status = 'pending' THEN
    FOR hairdresser_record IN (
      SELECT h.user_id, h.first_name, h.last_name
      FROM public.hairdressers h
      INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
      WHERE hh.hotel_id = NEW.hotel_id
        AND h.user_id IS NOT NULL
        AND h.status = 'active'
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_record.user_id,
        NEW.id,
        'new_booking',
        'Nouvelle réservation #' || NEW.booking_id || ' à ' || 
        COALESCE(NEW.hotel_name, 'l''hôtel') || ' pour le ' || 
        TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') || ' à ' || 
        TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update get_public_hotels function
CREATE OR REPLACE FUNCTION public.get_public_hotels()
RETURNS TABLE(id text, name text, image text, cover_image text, city text, country text, currency text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status
  FROM public.hotels h
  WHERE h.status = 'active';
$function$;

-- Update get_public_hotel_by_id function
CREATE OR REPLACE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(id text, name text, image text, cover_image text, city text, country text, currency text, status text, vat numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status,
    h.vat
  FROM public.hotels h
  WHERE h.id = _hotel_id
    AND h.status = 'active';
$function$;

-- Update get_public_treatments function
CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(id uuid, name text, description text, category text, service_for text, duration integer, price numeric, price_on_request boolean, lead_time integer, image text, sort_order integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    t.id,
    t.name,
    t.description,
    t.category,
    t.service_for,
    t.duration,
    t.price,
    t.price_on_request,
    t.lead_time,
    t.image,
    t.sort_order
  FROM public.treatment_menus t
  WHERE t.status = 'active'
    AND (t.hotel_id = _hotel_id OR t.hotel_id IS NULL)
  ORDER BY t.sort_order, t.name;
$function$;