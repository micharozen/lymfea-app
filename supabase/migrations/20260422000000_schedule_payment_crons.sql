-- ==============================================================================
-- Migration : schedule_payment_crons
-- Description : Planifie via pg_cron les deux fonctions de paiement :
--   - check-expired-payment-links  (toutes les 15 min)
--   - send-payment-reminder        (toutes les 30 min)
--
-- pg_cron + pg_net sont disponibles sur Supabase hébergé.
-- La service_role_key est lue depuis current_setting — jamais committée.
-- En local (pg_cron absent), la migration s'exécute sans erreur (RAISE NOTICE).
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    -- Supprimer les jobs existants pour éviter les doublons au re-run
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-expired-payment-links-cron') THEN
      PERFORM cron.unschedule('check-expired-payment-links-cron');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-payment-reminder-cron') THEN
      PERFORM cron.unschedule('send-payment-reminder-cron');
    END IF;

    -- Annulation automatique des bookings avec lien expiré (toutes les 15 min)
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
            body    := '{}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/check-expired-payment-links'
      )
    );

    -- Relances de paiement intelligentes (toutes les 30 min)
    PERFORM cron.schedule(
      'send-payment-reminder-cron',
      '*/30 * * * *',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/send-payment-reminder'
      )
    );

    RAISE NOTICE 'Crons enregistrés : check-expired-payment-links-cron (*/15) + send-payment-reminder-cron (*/30)';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — crons ignorés (environnement local)';
  END IF;
END;
$$;
