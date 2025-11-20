-- Create function to notify all eligible hairdressers when a new booking is created
CREATE OR REPLACE FUNCTION public.notify_hairdressers_new_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hairdresser_record RECORD;
BEGIN
  -- Only proceed if the new booking has status "En attente"
  IF NEW.status = 'En attente' THEN
    
    -- Loop through all hairdressers assigned to this hotel
    FOR hairdresser_record IN (
      SELECT h.user_id, h.first_name, h.last_name
      FROM public.hairdressers h
      INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
      WHERE hh.hotel_id = NEW.hotel_id
        AND h.user_id IS NOT NULL
        AND h.status = 'Actif'
    ) LOOP
      
      -- Create a notification for each eligible hairdresser
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
$$;

-- Create trigger to call the function on booking inserts
DROP TRIGGER IF EXISTS trigger_notify_new_booking ON public.bookings;

CREATE TRIGGER trigger_notify_new_booking
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_hairdressers_new_booking();