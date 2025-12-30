-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_booking_cancelled ON public.bookings;
DROP FUNCTION IF EXISTS public.trigger_cancellation_notifications();

-- Create a corrected function that uses the proper secret names
CREATE OR REPLACE FUNCTION public.trigger_cancellation_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Only trigger if status changed to 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    -- Get URL and key from vault with proper secret names
    SELECT decrypted_secret INTO _supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL';
    
    SELECT decrypted_secret INTO _service_role_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
    
    -- Only proceed if we have both values
    IF _supabase_url IS NOT NULL AND _service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/handle-booking-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_role_key
        ),
        body := jsonb_build_object(
          'bookingId', NEW.id,
          'cancellationReason', NEW.cancellation_reason
        )
      );
    ELSE
      -- Log warning if secrets are missing
      RAISE WARNING 'Missing secrets for cancellation notification: URL=%, KEY=%', 
        CASE WHEN _supabase_url IS NULL THEN 'NULL' ELSE 'SET' END,
        CASE WHEN _service_role_key IS NULL THEN 'NULL' ELSE 'SET' END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on bookings table
CREATE TRIGGER on_booking_cancelled
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cancellation_notifications();