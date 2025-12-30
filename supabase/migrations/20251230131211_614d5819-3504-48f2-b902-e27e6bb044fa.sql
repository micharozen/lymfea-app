-- Create a function to call the edge function when a booking is cancelled
CREATE OR REPLACE FUNCTION public.trigger_cancellation_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger if status changed to 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    -- Use pg_net to call the edge function asynchronously
    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/handle-booking-cancellation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := jsonb_build_object(
        'bookingId', NEW.id,
        'cancellationReason', NEW.cancellation_reason
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS on_booking_cancelled ON public.bookings;
CREATE TRIGGER on_booking_cancelled
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cancellation_notifications();