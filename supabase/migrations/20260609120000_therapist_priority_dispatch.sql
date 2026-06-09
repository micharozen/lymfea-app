-- ==============================================================================
-- Migration : therapist_priority_dispatch
-- Description : Permet de prioriser une thérapeute (typiquement CDI) sur un lieu :
--   - therapist_venues.is_priority : flag prioritaire
--   - therapist_venues.priority_exclusivity_minutes : durée d'exclusivité (min)
--   - bookings.priority_lock_until : fin de la fenêtre d'exclusivité
--   - bookings.priority_therapist_id : à qui la résa a été verrouillée
--   - bookings.priority_fallback_triggered_at : marqueur anti-double-broadcast
--
-- Un cron pg_cron tourne toutes les minutes pour invoquer l'edge function
-- priority-fallback-broadcast qui re-déclenche le broadcast aux autres
-- thérapeutes quand la fenêtre d'exclusivité expire sans accept ni décline.
-- ==============================================================================

-- 1. Colonnes sur therapist_venues
ALTER TABLE public.therapist_venues
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_exclusivity_minutes INTEGER;

ALTER TABLE public.therapist_venues
  ADD CONSTRAINT therapist_venues_priority_minutes_positive
  CHECK (priority_exclusivity_minutes IS NULL OR priority_exclusivity_minutes > 0);

-- Index partiel : lookup "y a-t-il une priorité sur ce lieu ?"
CREATE INDEX IF NOT EXISTS therapist_venues_priority_idx
  ON public.therapist_venues (hotel_id)
  WHERE is_priority = true;

-- 2. Colonnes sur bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS priority_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority_therapist_id UUID REFERENCES public.therapists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority_fallback_triggered_at TIMESTAMPTZ;

-- Index pour le cron de fallback (cible : pending + lock expiré + pas encore fallbacké)
CREATE INDEX IF NOT EXISTS bookings_priority_fallback_idx
  ON public.bookings (priority_lock_until)
  WHERE status = 'pending'
    AND priority_therapist_id IS NOT NULL
    AND priority_fallback_triggered_at IS NULL;

-- 3. Cron job : fallback temporel
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'priority-fallback-broadcast-cron') THEN
      PERFORM cron.unschedule('priority-fallback-broadcast-cron');
    END IF;

    -- Toutes les minutes : invoque l'edge function qui re-broadcaste
    -- les bookings dont la fenêtre d'exclusivité CDI est expirée.
    PERFORM cron.schedule(
      'priority-fallback-broadcast-cron',
      '* * * * *',
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
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/priority-fallback-broadcast'
      )
    );

    RAISE NOTICE 'Cron enregistré : priority-fallback-broadcast-cron (* * * * *)';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — cron priority-fallback ignoré (environnement local)';
  END IF;
END;
$$;
