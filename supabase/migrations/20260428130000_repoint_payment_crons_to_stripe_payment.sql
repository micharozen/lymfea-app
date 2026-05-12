-- ==============================================================================
-- Migration : repoint_payment_crons_to_stripe_payment
-- Description : Repointe le cron `check-expired-payment-links-cron` vers la
-- nouvelle edge function consolidée `stripe-payment` avec
-- action='check-expired-payment-links'. Le cron `send-payment-reminder-cron`
-- est conservé tel quel (la fonction send-payment-reminder reste autonome).
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-expired-payment-links-cron') THEN
      PERFORM cron.unschedule('check-expired-payment-links-cron');
    END IF;

    PERFORM cron.schedule(
      'check-expired-payment-links-cron',
      '*/15 * * * *',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{"action":"check-expired-payment-links"}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/stripe-payment'
      )
    );

    RAISE NOTICE 'Cron check-expired-payment-links-cron repointé vers stripe-payment';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — repoint ignoré (environnement local)';
  END IF;
END;
$$;
