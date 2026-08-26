-- Le cron complete-past-paid-bookings tournait une fois par nuit (03:00 UTC) sur
-- `booking_date < today` : la clôture quotidienne affichait donc 0 € toute la
-- journée, aucune résa du jour ne passant à 'completed' avant le lendemain matin.
--
-- L'edge function retient désormais les résas dont la FIN du soin remonte à plus
-- d'une heure (fuseau du lieu), ce qui n'a de sens qu'avec un passage horaire.
--
-- On modifie le PLANNING du job existant plutôt que de le recréer : sa commande
-- porte l'URL du projet, qui diffère entre staging et prod. La recréer ici
-- réintroduirait le hardcode d'hôte qui a déjà fait diverger les deux
-- environnements. Le repli cron.schedule ne sert qu'aux bases où le job n'existe
-- pas encore — et signale alors l'URL à vérifier.

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron non disponible — cron ignoré (environnement local)';
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'complete-past-paid-bookings';

  IF v_jobid IS NOT NULL THEN
    -- Toutes les heures à HH:07, décalé des crons alignés sur l'heure pile.
    PERFORM cron.alter_job(v_jobid, schedule => '7 * * * *');
    RAISE NOTICE 'Cron complete-past-paid-bookings replanifié : 7 * * * * (commande inchangée)';

  ELSIF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'complete-past-paid-bookings',
      '7 * * * *',
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
    RAISE WARNING 'Cron complete-past-paid-bookings créé avec l''URL STAGING — la corriger si cette base n''est pas staging';

  ELSE
    RAISE NOTICE 'pg_net non disponible — cron ignoré (environnement local)';
  END IF;
END;
$$;
