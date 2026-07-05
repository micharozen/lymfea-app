-- Marque 'completed' les bookings passés (date < aujourd'hui) déjà payés
-- mais restés dans un état non-terminal. Tourne 1×/jour à 03:00 UTC via pg_cron
-- (uniquement sur Supabase hébergé, ignoré en local).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'complete-past-paid-bookings',
      '0 3 * * *',
      $cron$
        UPDATE public.bookings
        SET status = 'completed',
            updated_at = NOW()
        WHERE booking_date < CURRENT_DATE
          AND payment_status IN ('paid', 'charged_to_room', 'offert', 'pending_partner_billing')
          AND status NOT IN ('completed', 'cancelled', 'noshow', 'no_show', 'declined', 'expired', 'Annulé')
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping cron job setup (will be created on hosted Supabase)';
  END IF;
END;
$$;
