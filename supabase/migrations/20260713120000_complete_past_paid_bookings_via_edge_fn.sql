-- Le cron complete-past-paid-bookings faisait un UPDATE SQL pur : les résas
-- facturées en chambre mais jamais finalisées passaient à 'completed' sans
-- facture, sans avance thérapeute, sans ledger et sans charge PMS (pilote Mews).
-- On le rebranche sur l'edge function complete-past-paid-bookings, qui route
-- les charged_to_room vers finalize-payment et complète simplement les autres.
--
-- ⚠️ URL staging ci-dessous : remplacer par l'hôte prod (wvderlgzetpptehxndqf)
-- avant application sur prod.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-past-paid-bookings') THEN
      PERFORM cron.unschedule('complete-past-paid-bookings');
    END IF;

    PERFORM cron.schedule(
      'complete-past-paid-bookings',
      '0 3 * * *',
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
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/complete-past-paid-bookings'
      )
    );

    RAISE NOTICE 'Cron rebranché : complete-past-paid-bookings → edge function (0 3 * * *)';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — cron ignoré (environnement local)';
  END IF;
END;
$$;
