-- Update the notify_hairdressers_new_booking function to only notify active hairdressers
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

-- Update notify_hairdressers_on_unassignment to only notify active hairdressers
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