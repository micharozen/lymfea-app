-- Create function to notify hairdresser when booking is cancelled
CREATE OR REPLACE FUNCTION public.notify_hairdresser_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hairdresser_user_id UUID;
BEGIN
  -- Only proceed if status changed to "Annulé" and there's an assigned hairdresser
  IF NEW.status = 'Annulé' AND OLD.status != 'Annulé' AND NEW.hairdresser_id IS NOT NULL THEN
    -- Get the user_id for the assigned hairdresser
    SELECT user_id INTO hairdresser_user_id
    FROM public.hairdressers
    WHERE id = NEW.hairdresser_id;

    -- If hairdresser has a user_id, create notification
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
$$;

-- Create trigger to call the function on booking updates
DROP TRIGGER IF EXISTS trigger_notify_cancellation ON public.bookings;

CREATE TRIGGER trigger_notify_cancellation
AFTER UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_hairdresser_on_cancellation();