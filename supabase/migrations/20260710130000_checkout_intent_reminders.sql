-- ==============================================================================
-- Migration : checkout_intent_reminders
-- Description : Couche de relance des paniers abandonnés (checkout_intents).
--   - Colonnes de cadence : reminder_count, reminder_sent_at
--   - RPC mark_checkout_intent_reminded (service_role uniquement)
--   - Cron send-checkout-intent-reminder-cron (toutes les 15 min)
-- ==============================================================================

ALTER TABLE checkout_intents
  ADD COLUMN IF NOT EXISTS reminder_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- File de relance : les intents ouverts jamais relancés, du plus ancien au plus récent.
CREATE INDEX IF NOT EXISTS idx_checkout_intents_pending_reminder
  ON checkout_intents (created_at)
  WHERE converted_at IS NULL AND reminder_count = 0;

-- ─── mark_checkout_intent_reminded (edge function cron only) ─────────────────
CREATE OR REPLACE FUNCTION mark_checkout_intent_reminded(_intent_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE checkout_intents
  SET reminder_count   = reminder_count + 1,
      reminder_sent_at = now()
  WHERE id = _intent_id
    AND converted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION mark_checkout_intent_reminded(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_checkout_intent_reminded(UUID) TO service_role;

-- ─── Cron : relance des paniers abandonnés (toutes les 15 min) ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-checkout-intent-reminder-cron') THEN
      PERFORM cron.unschedule('send-checkout-intent-reminder-cron');
    END IF;

    PERFORM cron.schedule(
      'send-checkout-intent-reminder-cron',
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
        'https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/send-checkout-intent-reminder'
      )
    );

    RAISE NOTICE 'Cron enregistré : send-checkout-intent-reminder-cron (*/15)';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — cron ignoré (environnement local)';
  END IF;
END;
$$;
