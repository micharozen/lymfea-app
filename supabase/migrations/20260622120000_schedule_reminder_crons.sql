-- Schedule pg_cron jobs for therapist availability reminders

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-schedule-reminder-weekly') THEN
      PERFORM cron.unschedule('send-schedule-reminder-weekly');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-schedule-reminder-monthly') THEN
      PERFORM cron.unschedule('send-schedule-reminder-monthly');
    END IF;

    PERFORM cron.schedule(
      'send-schedule-reminder-weekly',
      '0 9 * * 1',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{"reminderType":"weekly"}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/send-schedule-reminder'
      )
    );

    PERFORM cron.schedule(
      'send-schedule-reminder-monthly',
      '0 9 25 * *',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{"reminderType":"monthly"}'::jsonb
          );
        $sql$,
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/send-schedule-reminder'
      )
    );

    RAISE NOTICE 'Crons enregistrés : send-schedule-reminder-weekly + send-schedule-reminder-monthly';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — crons ignorés (environnement local)';
  END IF;
END;
$$;
