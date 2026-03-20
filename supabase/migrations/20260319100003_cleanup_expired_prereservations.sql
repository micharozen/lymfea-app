-- Cancel pre-reserved bookings that were never paid (awaiting_payment > 4 minutes)
-- Runs every minute via pg_cron (only available on hosted Supabase, skipped locally)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cancel-expired-prereservations',
      '* * * * *',
      'UPDATE bookings SET status = ''cancelled'', cancellation_reason = ''Paiement non reçu dans les 4 minutes'' WHERE payment_status = ''awaiting_payment'' AND created_at < NOW() - INTERVAL ''4 minutes'' AND status NOT IN (''cancelled'', ''Annulé'')'
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping cron job setup (will be created on hosted Supabase)';
  END IF;
END;
$$;
